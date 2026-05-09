import { useState, useEffect, useMemo, useRef } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { useAuthStore } from '../../store/authStore';
import { validateAssignments, scoreArrangement } from '../../services/seatingValidator';
import { generateSeatingArrangement } from '../../services/seatingAlgorithm';
import { exportSeatsPdf } from '../../services/pdfExportService';
import { saveArrangementHistory, loadHistory } from '../../services/cloudSyncService';
import { isSupabaseEnabled } from '../../services/supabaseClient';
import { getPlacementExplanation } from '../../services/scoringService';
import type { Wall, FixedElement, Desk, Seat, Student, ArrangementWarning, SeatingArrangement } from '../../types';
import DeskGridControls from './DeskGridControls';
import StudentManager from '../students/StudentManager';

const WALL_STYLES: Record<string, { color: string; width: number; dash?: number[] }> = {
  blank:        { color: '#1c1917', width: 6 },
  window_lobby: { color: '#0284c7', width: 5, dash: [10, 6] },
  window_yard:  { color: '#16a34a', width: 5, dash: [10, 6] },
  small_window: { color: '#0ea5e9', width: 3, dash: [4, 4] },
  door:         { color: '#ea580c', width: 6 },
  board:        { color: '#7c3aed', width: 8 },
};

interface Props { classroomId: string; }

export default function SeatingEditor({ classroomId }: Props) {
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const students = useStudentsStore((s) => s.byClassroom[classroomId] ?? []);
  const updateStudent = useStudentsStore((s) => s.update);
  const forbiddenGroups = useStudentsStore((s) => s.forbiddenGroups[classroomId] ?? []);
  const addForbiddenGroup = useStudentsStore((s) => s.addForbiddenGroup);
  const removeForbiddenGroup = useStudentsStore((s) => s.removeForbiddenGroup);
  const working = useArrangementStore((s) => s.workingByClassroom[classroomId]);
  const setWorking = useArrangementStore((s) => s.setWorking);
  const updateAssignments = useArrangementStore((s) => s.updateAssignments);
  const pinnedStudentIds = useArrangementStore((s) => s.pinnedByClassroom[classroomId] ?? []);
  const togglePin = useArrangementStore((s) => s.togglePin);
  const clearPins = useArrangementStore((s) => s.clearPins);
  const pinnedSet = useMemo(() => new Set(pinnedStudentIds), [pinnedStudentIds]);

  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null);
  const [draggedStudentId, setDraggedStudentId] = useState<string | null>(null);
  const [hoveredStudentId, setHoveredStudentId] = useState<string | null>(null);
  const [quickAssign, setQuickAssign] = useState<{ seatId: string; x: number; y: number } | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [genderMode, setGenderMode] = useState<'mix' | 'same' | null>(null);
  const [undoStack, setUndoStack] = useState<import('../../types').SeatAssignment[][]>([]);
  const [redoStack, setRedoStack] = useState<import('../../types').SeatAssignment[][]>([]);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cloudHistory, setCloudHistory] = useState<import('../../services/cloudSyncService').HistoryEntry[]>([]);
  // שילובים אסורים — מצב פאנל
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupIds, setNewGroupIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  // סלקטור פאנל ימני
  const [rightPanel, setRightPanel] = useState<'waiting' | 'forbidden' | 'students'>('waiting');
  const stageRef = useRef<Konva.Stage>(null);

  const user = useAuthStore((s) => s.user);
  const listForClassroom = useArrangementStore((s) => s.listForClassroom);
  const saveCurrent = useArrangementStore((s) => s.saveCurrent);
  const restore = useArrangementStore((s) => s.restore);
  const localHistory = useMemo(() => listForClassroom(classroomId), [listForClassroom, classroomId, working]);

  useEffect(() => {
    if (!showHistory || !isSupabaseEnabled() || !user) return;
    loadHistory(classroomId).then(setCloudHistory);
  }, [showHistory, classroomId, user]);

  useEffect(() => {
    if (!working && classroom) {
      setWorking(classroomId, {
        id: 'working_' + classroomId,
        name: '',
        classroomId,
        assignments: [],
        parkedStudentIds: [],
        score: 100,
        warnings: [],
        createdAt: new Date().toISOString(),
      });
    }
  }, [working, classroom, classroomId, setWorking]);

  // השיבוצים הנוכחיים מהחנות (תמיד)
  const assignments = working?.assignments ?? [];

  const displayAssignments = assignments;

  const seatToStudentId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of displayAssignments) m.set(a.seatId, a.studentId);
    return m;
  }, [displayAssignments]);

  const studentToSeatId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of displayAssignments) m.set(a.studentId, a.seatId);
    return m;
  }, [displayAssignments]);

  const unassigned = useMemo(
    () => students.filter((s) => !studentToSeatId.has(s.id)),
    [students, studentToSeatId]
  );

  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    return unassigned.filter((s) => s.name.includes(search.trim()));
  }, [unassigned, search]);

  const aloneCount = useMemo(
    () => students.filter((s) => s.tags.includes('better_alone')).length,
    [students]
  );
  const availableSeats = classroom ? classroom.seats.length - displayAssignments.length : 0;

  const displayWarnings = useMemo((): ArrangementWarning[] => {
    if (!classroom || !working) return [];
    return validateAssignments(working, classroom, students, { separateGenders: genderMode === 'same', mixGenders: genderMode === 'mix', forbiddenGroups });
  }, [working, classroom, students, genderMode, forbiddenGroups]);

  const displayScore = useMemo(() => scoreArrangement(displayWarnings), [displayWarnings]);

  const boyCount = useMemo(() => students.filter((s) => s.gender === 'm').length, [students]);
  const girlCount = useMemo(() => students.filter((s) => s.gender === 'f').length, [students]);

  const flaggedSeatIds = useMemo(() => {
    const s = new Set<string>();
    displayWarnings.forEach((w) => w.seatIds?.forEach((id) => s.add(id)));
    return s;
  }, [displayWarnings]);

  // מיקום מוחלט (stage-space) של כל מושב — לצורך חישוב נקודת נחיתה בגרירה
  const seatAbsolutePositions = useMemo(() => {
    if (!classroom) return new Map<string, { x: number; y: number }>();
    const map = new Map<string, { x: number; y: number }>();
    for (const desk of classroom.desks) {
      const seats = classroom.seats.filter((s) => s.deskId === desk.id);
      for (const seat of seats) {
        const dx = seat.side === 'solo' ? 0 : seat.side === 'left' ? -42 : 42;
        const rot = (desk.rotation * Math.PI) / 180;
        map.set(seat.id, {
          x: desk.position.x + Math.cos(rot) * dx,
          y: desk.position.y + Math.sin(rot) * dx,
        });
      }
    }
    return map;
  }, [classroom]);

  // התלמיד הפעיל לצורך הדגשת מושבים (נגרר / נבחר)
  const activeSeatQualityStudentId = draggedStudentId ?? pickedStudentId;

  // איכות כל מושב עבור התלמיד הפעיל
  const seatQualities = useMemo(() => {
    if (!activeSeatQualityStudentId || !classroom) return new Map<string, 'good' | 'bad' | 'neutral'>();
    const stu = students.find((s) => s.id === activeSeatQualityStudentId);
    if (!stu) return new Map<string, 'good' | 'bad' | 'neutral'>();

    const result = new Map<string, 'good' | 'bad' | 'neutral'>();
    for (const seat of classroom.seats) {
      const zones = new Set([...(seat.autoZones ?? []), ...(seat.manualZones ?? [])]);
      let bad = false;
      let good = false;

      // בדיקת avoidNear — השכן בשולחן
      const deskSeats = classroom.seats.filter((s) => s.deskId === seat.deskId && s.id !== seat.id);
      for (const ds of deskSeats) {
        const nid = seatToStudentId.get(ds.id);
        if (!nid || nid === activeSeatQualityStudentId) continue;
        if (stu.avoidNear.includes(nid)) { bad = true; break; }
        const n = students.find((s) => s.id === nid);
        if (n?.avoidNear.includes(stu.id)) { bad = true; break; }
      }

      if (stu.tags.includes('needs_very_front')) { if (zones.has('front_row')) good = true; else bad = true; }
      if (stu.tags.includes('needs_front')) { if (zones.has('front_row') || zones.has('second_row')) good = true; else bad = true; }
      if (stu.tags.includes('needs_wall') && zones.has('near_wall')) good = true;
      if (stu.tags.includes('distractible') && (zones.has('near_window') || zones.has('near_door'))) bad = true;
      if (stu.tags.includes('better_alone')) {
        if (seat.side === 'solo') {
          good = true;
        } else {
          const deskSeats = classroom.seats.filter((s) => s.deskId === seat.deskId && s.id !== seat.id);
          const neighborOccupied = deskSeats.some((ds) => seatToStudentId.has(ds.id));
          if (!neighborOccupied) good = true; else bad = true;
        }
      }
      if (stu.tags.includes('tall') && (zones.has('back_row') || zones.has('side_column'))) good = true;

      result.set(seat.id, bad ? 'bad' : good ? 'good' : 'neutral');
    }
    return result;
  }, [activeSeatQualityStudentId, classroom, students, seatToStudentId]);

  // הסבר שיבוץ — לתלמיד המרחף / הנבחר
  const explanationStudentId = hoveredStudentId ?? pickedStudentId;

  const placementExplanation = useMemo(() => {
    if (!explanationStudentId || !classroom || !working) return null;
    return getPlacementExplanation(explanationStudentId, { ...working, assignments: displayAssignments }, classroom, students);
  }, [explanationStudentId, working, displayAssignments, classroom, students]);

  const saveEditName = () => {
    if (editingNameId && editingNameValue.trim()) {
      updateStudent(classroomId, editingNameId, { name: editingNameValue.trim() });
    }
    setEditingNameId(null);
  };

  if (!classroom) return null;

  // ── היסטוריה (undo/redo) ──────────────────────────────────
  const updateWithHistory = (next: import('../../types').SeatAssignment[]) => {
    setUndoStack((s) => [...s.slice(-49), assignments]);
    setRedoStack([]);
    updateAssignments(classroomId, next);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((s) => [...s, assignments]);
    setUndoStack((s) => s.slice(0, -1));
    updateAssignments(classroomId, prev);
    setPickedStudentId(null);
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((s) => [...s, assignments]);
    setRedoStack((s) => s.slice(0, -1));
    updateAssignments(classroomId, next);
    setPickedStudentId(null);
  };

  // ── פעולות שיבוץ ──────────────────────────────────────────
  const assignToSeat = (seatId: string, studentId: string) => {
    const next = assignments.filter((a) => a.seatId !== seatId && a.studentId !== studentId);
    next.push({ seatId, studentId });
    updateWithHistory(next);
  };

  const removeFromSeat = (seatId: string) => {
    updateWithHistory(assignments.filter((a) => a.seatId !== seatId));
  };

  const onSeatClick = (seatId: string) => {
    const occupant = seatToStudentId.get(seatId);
    if (pickedStudentId) {
      if (pinnedSet.has(pickedStudentId)) { setPickedStudentId(null); return; }
      const pickedSeat = studentToSeatId.get(pickedStudentId);
      if (occupant && occupant !== pickedStudentId) {
        if (pinnedSet.has(occupant)) { setPickedStudentId(null); return; }
        if (pickedSeat) {
          updateWithHistory(assignments.map((a) => {
            if (a.studentId === pickedStudentId) return { seatId, studentId: pickedStudentId };
            if (a.seatId === seatId) return { seatId: pickedSeat, studentId: occupant };
            return a;
          }));
        } else {
          assignToSeat(seatId, pickedStudentId);
        }
      } else {
        assignToSeat(seatId, pickedStudentId);
      }
      setPickedStudentId(null);
    } else if (occupant && !pinnedSet.has(occupant)) {
      setPickedStudentId(occupant);
    } else if (!occupant) {
      const pos = seatAbsolutePositions.get(seatId);
      if (pos) { setQuickAssign({ seatId, x: pos.x, y: pos.y }); setQuickSearch(''); }
    }
  };

  const onSeatDblClick = (seatId: string) => {
    const occupant = seatToStudentId.get(seatId);
    if (occupant && !pinnedSet.has(occupant)) {
      removeFromSeat(seatId);
      setPickedStudentId(null);
    }
  };

  const onParkingStudentClick = (studentId: string) => {
    setPickedStudentId(pickedStudentId === studentId ? null : studentId);
  };

  const onParkingDrop = () => {
    if (pickedStudentId && studentToSeatId.has(pickedStudentId)) {
      removeFromSeat(studentToSeatId.get(pickedStudentId)!);
      setPickedStudentId(null);
    }
  };

  const clearAllAssignments = () => {
    if (assignments.length === 0) return;
    if (!confirm(`לנקות את כל ${assignments.length} השיבוצים?`)) return;
    updateWithHistory([]);
    clearPins(classroomId);
    setPickedStudentId(null);
  };

  const clearExceptPinned = () => {
    const toKeep = assignments.filter((a) => pinnedSet.has(a.studentId));
    const toClear = assignments.length - toKeep.length;
    if (toClear === 0) return;
    if (!confirm(`למחוק ${toClear} שיבוצים? הנעוצים (${toKeep.length}) יישארו.`)) return;
    updateWithHistory(toKeep);
    setPickedStudentId(null);
  };

  // ── גרירה מה-Konva (בין מושבים) ─────────────────────────────
  const onKonvaDragEnd = (
    e: { target: { getAbsolutePosition: () => { x: number; y: number }; position: (p: { x: number; y: number }) => void }; cancelBubble: boolean },
    seatId: string,
    dx: number
  ) => {
    e.cancelBubble = true;
    const node = e.target;
    const absPos = node.getAbsolutePosition();
    node.position({ x: dx, y: 0 });

    const draggedId = seatToStudentId.get(seatId);
    setDraggedStudentId(null);
    if (!draggedId) return;

    let minDist = Infinity;
    let targetSeatId: string | null = null;
    for (const [sid, pos] of seatAbsolutePositions) {
      if (sid === seatId) continue;
      const d = Math.hypot(absPos.x - pos.x, absPos.y - pos.y);
      if (d < minDist) { minDist = d; targetSeatId = sid; }
    }
    if (!targetSeatId || minDist > 60) return;

    const targetOccupant = seatToStudentId.get(targetSeatId);
    if (targetOccupant) {
      if (pinnedSet.has(targetOccupant)) return;
      updateWithHistory(assignments.map((a) => {
        if (a.seatId === seatId) return { seatId: targetSeatId!, studentId: draggedId };
        if (a.seatId === targetSeatId) return { seatId, studentId: targetOccupant };
        return a;
      }));
    } else {
      updateWithHistory(assignments.map((a) =>
        a.seatId === seatId ? { seatId: targetSeatId!, studentId: draggedId } : a
      ));
    }
  };

  // ── גרירה מאזור ההמתנה (HTML5) אל הקנבס ────────────────────
  const onCanvasDragOver = (e: React.DragEvent) => e.preventDefault();

  const onCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const studentId = e.dataTransfer.getData('text/plain');
    setDraggedStudentId(null);
    if (!studentId) return;
    const container = stageRef.current?.container();
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const stageX = e.clientX - rect.left;
    const stageY = e.clientY - rect.top;

    let minDist = Infinity;
    let targetSeatId: string | null = null;
    for (const [sid, pos] of seatAbsolutePositions) {
      if (seatToStudentId.has(sid)) continue;
      const d = Math.hypot(stageX - pos.x, stageY - pos.y);
      if (d < minDist) { minDist = d; targetSeatId = sid; }
    }
    if (targetSeatId && minDist < 60) assignToSeat(targetSeatId, studentId);
  };

  // ── יצירת סידור AI — מיישם את הטוב מ-3 ניסיונות ────────────
  const generateWithAI = () => {
    if (students.length === 0 || classroom.seats.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      try {
        const pinnedAssignments = assignments.filter((a) => pinnedSet.has(a.studentId));
        const pinnedSeatIds = new Set(pinnedAssignments.map((a) => a.seatId));
        const pinnedStudIds = new Set(pinnedAssignments.map((a) => a.studentId));
        const freeStudents = students.filter((s) => !pinnedStudIds.has(s.id));
        const freeClassroom = { ...classroom, seats: classroom.seats.filter((s) => !pinnedSeatIds.has(s.id)) };
        const baseSeed = Date.now();

        const candidates = [0, 12345, 67890].map((offset) => {
          const raw = generateSeatingArrangement(freeClassroom, freeStudents, {
            candidates: 60, seed: baseSeed + offset,
            separateGenders: genderMode === 'same', mixGenders: genderMode === 'mix', forbiddenGroups,
          });
          const merged = { ...raw, assignments: [...pinnedAssignments, ...raw.assignments] };
          const warnings = validateAssignments(merged, classroom, students, { separateGenders: genderMode === 'same', mixGenders: genderMode === 'mix', forbiddenGroups });
          return { ...merged, warnings, score: scoreArrangement(warnings) };
        });

        const best = candidates.reduce((a, b) => b.score > a.score ? b : a);
        updateWithHistory(best.assignments);
        setPickedStudentId(null);
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  const exportPdf = () => {
    if (!stageRef.current || !classroom) return;
    exportSeatsPdf(stageRef.current, {
      classroomName: classroom.name,
      teacherName: user?.user_metadata?.full_name ?? user?.email,
      title: `סידור ישיבה — ${classroom.name}`,
    });
  };

  const saveArrangement = async () => {
    if (!working) return;
    const name = prompt('שם לסידור (לדוגמה: "שבוע א\'")', `סידור ${new Date().toLocaleDateString('he-IL')}`);
    if (!name) return;
    const id = saveCurrent(classroomId, name);
    if (id && isSupabaseEnabled() && user && classroom) {
      const arr = useArrangementStore.getState().saved[id];
      if (arr) await saveArrangementHistory(arr, classroom.name);
    }
  };

  const restoreFromHistory = (arr: SeatingArrangement) => {
    updateAssignments(classroomId, arr.assignments);
    setUndoStack([]); setRedoStack([]);
    setPickedStudentId(null);
    setShowHistory(false);
  };

  // ── רינדור קנבס ───────────────────────────────────────────────
  const renderWall = (w: Wall) => {
    const style = WALL_STYLES[w.type] ?? WALL_STYLES.blank;
    const flat: number[] = [];
    w.points.forEach((p) => { flat.push(p.x, p.y); });
    return (
      <Line key={w.id} points={flat} stroke={style.color} strokeWidth={style.width}
            dash={style.dash} lineCap="round" lineJoin="round" listening={false} />
    );
  };

  const renderTeacherDesk = (el: FixedElement) => {
    const isGamma = el.type === 'teacher_desk_gamma';
    return (
      <Group key={el.id} x={el.position.x} y={el.position.y} rotation={el.rotation} listening={false}>
        <Rect x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height}
              fill="#fef3c7" stroke="#92400e" strokeWidth={2} cornerRadius={4} />
        {isGamma && el.gammaArmLength && (
          <Rect x={-el.width / 2} y={el.height / 2} width={el.gammaArmLength} height={el.height * 0.7}
                fill="#fef3c7" stroke="#92400e" strokeWidth={2} cornerRadius={4} />
        )}
        <Text x={-el.width / 2} y={-8} width={el.width} align="center"
              text="מורה" fontSize={11} fontFamily="Heebo" fill="#92400e" fontStyle="bold" />
      </Group>
    );
  };

  const renderDesk = (desk: Desk) => {
    const seats = classroom.seats.filter((s) => s.deskId === desk.id);
    const w = desk.seatCount === 2 ? 176 : 104;
    const h = 92;
    return (
      <Group key={desk.id} x={desk.position.x} y={desk.position.y} rotation={desk.rotation}>
        <Rect x={-w / 2} y={-h / 2} width={w} height={h}
              fill="#e7e5e4" stroke="#78716c" strokeWidth={1.5} cornerRadius={6}
              listening={false} />
        {seats.map((seat) => renderSeat(seat))}
      </Group>
    );
  };

  const renderSeat = (seat: Seat) => {
    const isSolo = seat.side === 'solo';
    const r = isSolo ? 44 : 43;
    const dx = isSolo ? 0 : (seat.side === 'left' ? -42 : 42);

    const studentId = seatToStudentId.get(seat.id);
    const stu = studentId ? students.find((s) => s.id === studentId) : null;
    const isPicked = pickedStudentId != null && studentId === pickedStudentId;
    const isActiveSource = activeSeatQualityStudentId != null && studentId === activeSeatQualityStudentId;
    const isFlagged = flaggedSeatIds.has(seat.id);
    const isPinned = studentId ? pinnedSet.has(studentId) : false;
    const quality = (!stu && activeSeatQualityStudentId) ? seatQualities.get(seat.id) : undefined;

    // צבעי עיגול
    let bgColor: string;
    let strokeColor: string;
    let strokeW: number;

    if (stu) {
      bgColor = stu.gender === 'm' ? '#dbeafe' : stu.gender === 'f' ? '#fce7f3' : '#fff';
      if (isActiveSource || isPicked) { strokeColor = '#ea580c'; strokeW = 3; }
      else if (isPinned)              { strokeColor = '#7c3aed'; strokeW = 3; }
      else if (isFlagged)             { strokeColor = '#dc2626'; strokeW = 3; }
      else                            { strokeColor = '#16a34a'; strokeW = 2; }
    } else if (quality === 'good') {
      bgColor = '#dcfce7'; strokeColor = '#16a34a'; strokeW = 2;
    } else if (quality === 'bad') {
      bgColor = '#fee2e2'; strokeColor = '#dc2626'; strokeW = 2;
    } else {
      bgColor = '#fff'; strokeColor = '#a8a29e'; strokeW = 2;
    }

    const seatLines = stu ? getSeatLines(stu) : [];
    const fontSize = stu ? calcLineFontSize(seatLines, r) : 10;
    const textW = Math.round(r * 1.85);
    const pinOff = Math.round(r * 0.68);
    const pinR = 9;
    const textColor = stu
      ? (stu.gender === 'm' ? '#1d4ed8' : stu.gender === 'f' ? '#be185d' : '#1c1917')
      : '#a8a29e';

    const canDrag = !!stu && !isPinned;

    return (
      <Group key={seat.id}>
        <Circle
          x={dx} y={0} radius={r}
          fill={bgColor} stroke={strokeColor} strokeWidth={strokeW}
          draggable={canDrag}
          listening={true}
          onMouseEnter={() => { if (stu) setHoveredStudentId(stu.id); }}
          onMouseLeave={() => setHoveredStudentId(null)}
          onClick={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
          onTap={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
          onDblClick={(e) => { e.cancelBubble = true; onSeatDblClick(seat.id); }}
          onDblTap={(e) => { e.cancelBubble = true; onSeatDblClick(seat.id); }}
          onDragStart={(e) => { e.cancelBubble = true; if (stu) setDraggedStudentId(stu.id); }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onDragEnd={(e: any) => onKonvaDragEnd(e, seat.id, dx)}
        />
        {stu && (() => {
          const lineH = fontSize + 2;
          const totalH = seatLines.length * lineH;
          return seatLines.map((line, i) => (
            <Text
              key={i}
              x={dx - textW / 2}
              y={-totalH / 2 + i * lineH}
              width={textW} align="center"
              text={line} fontSize={fontSize} fontFamily="Heebo" fill={textColor} fontStyle="bold"
              listening={false}
            />
          ));
        })()}
        {!stu && !activeSeatQualityStudentId && (
          <Text
            x={dx - 8} y={-9}
            width={16} align="center"
            text="+" fontSize={16} fontFamily="Heebo" fill="#c4bdb9"
            listening={false}
          />
        )}
        {stu && (
          <>
            <Circle
              x={dx + pinOff} y={-pinOff} radius={pinR}
              fill={isPinned ? '#7c3aed' : '#e2e8f0'}
              stroke={isPinned ? '#5b21b6' : '#94a3b8'} strokeWidth={1}
              listening={true}
              onClick={(e) => { e.cancelBubble = true; togglePin(classroomId, stu.id); }}
              onTap={(e) => { e.cancelBubble = true; togglePin(classroomId, stu.id); }}
            />
            <Text
              x={dx + pinOff - pinR} y={-pinOff - pinR + 1}
              width={pinR * 2} align="center"
              text="📌" fontSize={isPinned ? 9 : 8} listening={false}
            />
          </>
        )}
      </Group>
    );
  };

  // ── UI ────────────────────────────────────────────────────────
  return (
    <div>
      {/* פס סטטיסטיקה */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginBottom: 12,
        background: 'var(--bg2)', border: '1px solid var(--bd)',
        borderRadius: 'var(--rs)', padding: '8px 14px',
      }}>
        {/* ימין — סטטיסטיקות שיבוץ */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'מקומות פנויים', value: availableSeats, color: availableSeats > 0 ? '#0284c7' : '#16a34a' },
            { label: 'ממתינים לשיבוץ', value: unassigned.length, color: unassigned.length > 0 ? '#ca8a04' : '#16a34a' },
            { label: 'כדאי לבד', value: aloneCount, color: '#7c3aed' },
            { label: 'נעוצים', value: pinnedStudentIds.length, color: '#7c3aed' },
          ].map((stat) => (
            <div key={stat.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: stat.color, color: '#fff', borderRadius: 10, padding: '2px 9px', fontWeight: 800, fontSize: 13 }}>
                {stat.value}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{stat.label}</span>
            </div>
          ))}
        </div>
        {/* שמאל — ספירת תלמידים */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', borderRight: '1px solid var(--bd)', paddingRight: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{students.length} תלמידים</span>
          <span style={{ fontSize: 13, color: '#1d4ed8', fontWeight: 700 }}>👦 {boyCount}</span>
          <span style={{ fontSize: 13, color: '#be185d', fontWeight: 700 }}>👧 {girlCount}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        {/* ── עמודה שמאלית: קנבס ── */}
        <div>
          {/* פעולות עליונות */}
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
            padding: 10, marginBottom: 10, boxShadow: 'var(--sh)',
            display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
          }}>
            <button
              onClick={generateWithAI}
              disabled={generating || students.length === 0 || classroom.seats.length === 0}
              style={{
                background: generating ? '#a78bfa' : 'var(--ac)', color: '#fff', border: 'none',
                borderRadius: 'var(--rs)', padding: '8px 16px', fontWeight: 800, fontSize: 13,
                cursor: generating || students.length === 0 ? 'not-allowed' : 'pointer',
                opacity: generating || students.length === 0 ? 0.7 : 1, fontFamily: 'inherit',
              }}
            >
              {generating ? '⏳ מחשב...' : '✨ סידור חדש בעזרת AI'}
            </button>
            <button
              onClick={saveArrangement}
              disabled={!working || assignments.length === 0}
              style={{
                background: 'var(--bg2)', color: 'var(--ink)', border: '1.5px solid var(--bd)',
                borderRadius: 'var(--rs)', padding: '8px 16px', fontWeight: 700, fontSize: 13,
                cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
                opacity: assignments.length > 0 ? 1 : 0.5, fontFamily: 'inherit',
              }}
            >
              💾 שמור
            </button>
            <button
              onClick={exportPdf}
              disabled={assignments.length === 0}
              style={{
                background: 'var(--bg2)', color: 'var(--ink)', border: '1.5px solid var(--bd)',
                borderRadius: 'var(--rs)', padding: '8px 16px', fontWeight: 700, fontSize: 13,
                cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
                opacity: assignments.length > 0 ? 1 : 0.5, fontFamily: 'inherit',
              }}
            >
              📄 PDF
            </button>
            <button
              onClick={clearAllAssignments}
              disabled={assignments.length === 0}
              style={{
                background: 'var(--bg2)', color: '#dc2626',
                border: '1.5px solid #fecaca', borderRadius: 'var(--rs)',
                padding: '8px 16px', fontWeight: 700, fontSize: 13,
                cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
                opacity: assignments.length > 0 ? 1 : 0.5, fontFamily: 'inherit',
              }}
            >
              🗑 נקה הכל
            </button>
            <button
              onClick={clearExceptPinned}
              disabled={assignments.filter((a) => !pinnedSet.has(a.studentId)).length === 0}
              style={{
                background: 'var(--bg2)', color: '#dc2626',
                border: '1.5px solid #fecaca', borderRadius: 'var(--rs)',
                padding: '8px 16px', fontWeight: 700, fontSize: 13,
                cursor: assignments.filter((a) => !pinnedSet.has(a.studentId)).length > 0 ? 'pointer' : 'not-allowed',
                opacity: assignments.filter((a) => !pinnedSet.has(a.studentId)).length > 0 ? 1 : 0.5, fontFamily: 'inherit',
              }}
            >
              🗑 מחק חוץ מנעוצים
            </button>
            <button
              onClick={() => setGenderMode(genderMode === 'mix' ? null : 'mix')}
              style={{
                background: genderMode === 'mix' ? '#0284c7' : 'var(--bg2)',
                color: genderMode === 'mix' ? '#fff' : 'var(--ink)',
                border: `1.5px solid ${genderMode === 'mix' ? '#0284c7' : 'var(--bd)'}`,
                borderRadius: 'var(--rs)', padding: '8px 12px', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              title="שבץ בנים ובנות באותו שולחן"
            >
              ⚤ הפרד בנים/בנות
            </button>
            <button
              onClick={() => setGenderMode(genderMode === 'same' ? null : 'same')}
              style={{
                background: genderMode === 'same' ? '#7c3aed' : 'var(--bg2)',
                color: genderMode === 'same' ? '#fff' : 'var(--ink)',
                border: `1.5px solid ${genderMode === 'same' ? '#7c3aed' : 'var(--bd)'}`,
                borderRadius: 'var(--rs)', padding: '8px 12px', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              title="שבץ בנים עם בנים ובנות עם בנות"
            >
              👥 אותו מין יחד
            </button>
            {/* undo / redo */}
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              style={{
                background: 'var(--bg2)', color: undoStack.length > 0 ? 'var(--ink)' : 'var(--ink3)',
                border: '1.5px solid var(--bd)', borderRadius: 'var(--rs)',
                padding: '8px 12px', fontWeight: 700, fontSize: 13,
                cursor: undoStack.length > 0 ? 'pointer' : 'not-allowed',
                opacity: undoStack.length > 0 ? 1 : 0.4, fontFamily: 'inherit',
              }}
              title={`בטל (${undoStack.length} שלבים)`}
            >
              ↩ בטל
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              style={{
                background: 'var(--bg2)', color: redoStack.length > 0 ? 'var(--ink)' : 'var(--ink3)',
                border: '1.5px solid var(--bd)', borderRadius: 'var(--rs)',
                padding: '8px 12px', fontWeight: 700, fontSize: 13,
                cursor: redoStack.length > 0 ? 'pointer' : 'not-allowed',
                opacity: redoStack.length > 0 ? 1 : 0.4, fontFamily: 'inherit',
              }}
              title={`הבא (${redoStack.length} שלבים)`}
            >
              ↪ הבא
            </button>
            <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
                <strong>{displayAssignments.length}</strong> משובצים · <strong>{unassigned.length}</strong> ממתינים
              </span>
              <span style={{
                background: displayScore >= 80 ? '#16a34a' : displayScore >= 60 ? '#ca8a04' : '#dc2626',
                color: '#fff', fontSize: 13, fontWeight: 800, padding: '4px 10px', borderRadius: 12,
              }}>
                ציון: {displayScore}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
            {pickedStudentId
              ? '👆 לחץ על מושב לשיבוץ · גרור ישירות · לחץ "אזור המתנה" להחזיר'
              : '💡 לחץ/גרור תלמיד מרשימת ההמתנה · לחץ על מושב תפוס להזזה · דאבל-קליק להסרה · ↩ בטל לביטול מהלך'}
          </div>

          <DeskGridControls classroomId={classroomId}>
            <div
              style={{
                background: 'var(--bg2)', border: '1.5px solid var(--bd)', borderRadius: 'var(--r)',
                overflow: 'hidden', boxShadow: 'var(--sh)', position: 'relative',
              }}
              onDragOver={onCanvasDragOver}
              onDrop={onCanvasDrop}
            >
              <Stage
                ref={stageRef}
                width={classroom.width} height={classroom.height}
                style={{ background: '#fff', cursor: (pickedStudentId || draggedStudentId) ? 'crosshair' : 'default' }}
              >
                <Layer>
                  {classroom.walls.map(renderWall)}
                  {classroom.fixedElements.map(renderTeacherDesk)}
                  {classroom.desks.map(renderDesk)}
                </Layer>
              </Stage>

              {/* שיבוץ מהיר — נפתח בלחיצה על כיסא ריק */}
              {quickAssign && (
                <div
                  style={{
                    position: 'absolute',
                    left: Math.min(quickAssign.x - 70, classroom.width - 168),
                    top: Math.max(4, quickAssign.y - 90),
                    zIndex: 200,
                    background: '#fff',
                    border: '1.5px solid var(--bd)',
                    borderRadius: 10,
                    boxShadow: '0 4px 20px rgba(0,0,0,.18)',
                    padding: 8,
                    minWidth: 164,
                    direction: 'rtl',
                  }}
                >
                  <input
                    autoFocus
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') { setQuickAssign(null); setQuickSearch(''); }
                      if (e.key === 'Enter') {
                        const first = unassigned.find((s) => !quickSearch.trim() || s.name.includes(quickSearch.trim()));
                        if (first) { assignToSeat(quickAssign.seatId, first.id); setQuickAssign(null); setQuickSearch(''); }
                      }
                    }}
                    onBlur={() => setTimeout(() => { setQuickAssign(null); setQuickSearch(''); }, 150)}
                    placeholder="🔍 שם תלמיד..."
                    style={{
                      width: '100%', padding: '5px 8px', fontSize: 13,
                      border: '1px solid var(--bd)', borderRadius: 6,
                      fontFamily: 'inherit', direction: 'rtl',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ maxHeight: 148, overflowY: 'auto', marginTop: 4 }}>
                    {unassigned
                      .filter((s) => !quickSearch.trim() || s.name.includes(quickSearch.trim()))
                      .slice(0, 8)
                      .map((s) => (
                        <div
                          key={s.id}
                          onMouseDown={(e) => { e.preventDefault(); }}
                          onClick={() => {
                            assignToSeat(quickAssign.seatId, s.id);
                            setQuickAssign(null);
                            setQuickSearch('');
                          }}
                          style={{
                            padding: '5px 8px', cursor: 'pointer', fontSize: 13,
                            borderRadius: 5,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                        >
                          {s.name}
                        </div>
                      ))
                    }
                    {unassigned.filter((s) => !quickSearch.trim() || s.name.includes(quickSearch.trim())).length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', padding: '5px 8px' }}>אין תוצאות</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DeskGridControls>
        </div>

        {/* ── עמודה ימנית ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 90 }}>
          {/* טאבים */}
          <div style={{
            display: 'flex', borderBottom: '2px solid var(--bd)', marginBottom: 12,
            background: 'var(--bg2)', borderRadius: 'var(--rs) var(--rs) 0 0',
          }}>
            {(['waiting', 'forbidden', 'students'] as const).map((panel) => {
              const labels: Record<string, string> = {
                waiting: '⏳ שיבוץ',
                forbidden: `📛 שילובים${forbiddenGroups.length ? ` (${forbiddenGroups.length})` : ''}`,
                students: `👥 תלמידים (${students.length})`,
              };
              const isActive = rightPanel === panel;
              return (
                <button
                  key={panel}
                  onClick={() => setRightPanel(panel)}
                  style={{
                    flex: 1, padding: '8px 4px', fontSize: 11, fontWeight: isActive ? 800 : 600,
                    background: isActive ? 'var(--ac)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--ink2)',
                    border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    borderRadius: isActive ? 'var(--rs) var(--rs) 0 0' : 0,
                  }}
                >
                  {labels[panel]}
                </button>
              );
            })}
          </div>

          {/* ── פאנל שיבוץ ── */}
          {rightPanel === 'waiting' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* אזור המתנה */}
              <div
                onClick={onParkingDrop}
                style={{
                  background: pickedStudentId && studentToSeatId.has(pickedStudentId) ? '#fff7ed' : 'var(--bg2)',
                  border: pickedStudentId && studentToSeatId.has(pickedStudentId)
                    ? '2px dashed var(--ac)' : '1px solid var(--bd)',
                  borderRadius: 'var(--r)', padding: 12, boxShadow: 'var(--sh)',
                  cursor: pickedStudentId && studentToSeatId.has(pickedStudentId) ? 'pointer' : 'default',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>
                  ⏳ אזור המתנה ({unassigned.length})
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { e.stopPropagation(); setSearch(e.target.value); }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="🔍 חיפוש..."
                  style={{
                    width: '100%', padding: '6px 10px', fontSize: 13,
                    border: '1px solid var(--bd2)', borderRadius: 'var(--rs)',
                    fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box', marginBottom: 8,
                  }}
                />
                <div style={{ maxHeight: 300, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {filteredUnassigned.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: 12 }}>
                      {unassigned.length === 0 ? '✓ כולם משובצים!' : 'אין תוצאות'}
                    </div>
                  ) : filteredUnassigned.map((s) => {
                    const isP = pickedStudentId === s.id;
                    const bg = s.gender === 'm' ? '#eff6ff' : s.gender === 'f' ? '#fdf2f8' : 'var(--bg)';
                    const color = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
                    const border = s.gender === 'm' ? '#bfdbfe' : s.gender === 'f' ? '#fbcfe8' : 'var(--bd)';
                    const isEditing = editingNameId === s.id;
                    return (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isEditing ? (
                          <input
                            autoFocus
                            value={editingNameValue}
                            onChange={(e) => setEditingNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditName();
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                            onBlur={saveEditName}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              flex: 1, padding: '5px 10px', fontSize: 13, fontWeight: 700,
                              border: `1.5px solid ${border}`, borderRadius: 'var(--rs)',
                              fontFamily: 'inherit', direction: 'rtl', background: bg, color,
                            }}
                          />
                        ) : (
                          <button
                            draggable
                            onDragStart={(e) => { e.dataTransfer.setData('text/plain', s.id); setDraggedStudentId(s.id); }}
                            onDragEnd={() => setDraggedStudentId(null)}
                            onClick={(e) => { e.stopPropagation(); onParkingStudentClick(s.id); }}
                            style={{
                              flex: 1, background: isP ? '#fff7ed' : bg,
                              color, border: isP ? '2px solid var(--ac)' : `1.5px solid ${border}`,
                              borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 13, fontWeight: 700,
                              cursor: 'grab', fontFamily: 'inherit', textAlign: 'right',
                            }}
                          >
                            {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                          </button>
                        )}
                        {!isEditing && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingNameId(s.id); setEditingNameValue(s.name); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, opacity: 0.5, padding: '0 2px', lineHeight: 1 }}
                            title="ערוך שם"
                          >✏️</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* הסבר שיבוץ */}
              {placementExplanation && (
                <div style={{
                  background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
                  padding: 12, boxShadow: 'var(--sh)',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔍{' '}
                    {editingNameId === explanationStudentId ? (
                      <input
                        autoFocus
                        value={editingNameValue}
                        onChange={(e) => setEditingNameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditName(); if (e.key === 'Escape') setEditingNameId(null); }}
                        onBlur={saveEditName}
                        style={{ flex: 1, padding: '2px 6px', fontSize: 13, borderRadius: 4, border: '1px solid var(--bd)', fontFamily: 'inherit', direction: 'rtl' }}
                      />
                    ) : (
                      <>
                        <span>{students.find((s) => s.id === explanationStudentId)?.name ?? ''}</span>
                        <button
                          onClick={() => { const stu = students.find((s) => s.id === explanationStudentId); if (stu) { setEditingNameId(stu.id); setEditingNameValue(stu.name); } }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, opacity: 0.5, padding: 0 }}
                          title="ערוך שם"
                        >✏️</button>
                      </>
                    )}
                  </div>
                  {placementExplanation.seatId === null ? (
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>⏳ ממתין לשיבוץ</div>
                  ) : placementExplanation.reasons.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ink3)' }}>אין אילוצים מיוחדים</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {placementExplanation.reasons.map((r, i) => (
                        <div key={i} style={{
                          fontSize: 12,
                          color: r.satisfied ? '#166534' : '#991b1b',
                          background: r.satisfied ? '#f0fdf4' : '#fff1f2',
                          borderRadius: 6, padding: '4px 8px',
                        }}>
                          {r.tag}: {r.note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* אזהרות */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
                padding: 12, boxShadow: 'var(--sh)',
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  ⚠ התראות ({displayWarnings.length})
                </div>
                {displayWarnings.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--gn)', fontWeight: 600 }}>✓ אין התראות. הסידור מאוזן.</div>
                ) : (
                  <div style={{ maxHeight: 200, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {displayWarnings.map((w, i) => (
                      <div key={i} style={{
                        background: w.type === 'hard' ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${w.type === 'hard' ? '#fecaca' : '#fde68a'}`,
                        borderRadius: 'var(--rs)', padding: '8px 10px',
                        fontSize: 12, color: w.type === 'hard' ? '#991b1b' : '#92400e',
                      }}>
                        {w.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* היסטוריה */}
              <div style={{
                background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
                padding: 12, boxShadow: 'var(--sh)',
              }}>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  style={{
                    width: '100%', background: 'none', border: 'none', padding: 0,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 800 }}>📅 היסטוריה ({localHistory.length})</span>
                  <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{showHistory ? '▲' : '▼'}</span>
                </button>
                {showHistory && (
                  <div style={{ marginTop: 10 }}>
                    {localHistory.length === 0 && cloudHistory.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: 8 }}>
                        אין סידורים שמורים עדיין
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
                        {localHistory.map((arr) => (
                          <HistoryItem
                            key={arr.id}
                            name={arr.name}
                            date={arr.createdAt}
                            onRestore={() => { restore(arr.id); setShowHistory(false); setPickedStudentId(null); }}
                          />
                        ))}
                        {cloudHistory
                          .filter((ch) => !localHistory.find((lh) => lh.id === ch.id))
                          .map((ch) => (
                            <HistoryItem
                              key={ch.id}
                              name={ch.name || ch.classroomName}
                              date={ch.createdAt}
                              cloud
                              onRestore={() => restoreFromHistory(ch.data)}
                            />
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── פאנל שילובים אסורים ── */}
          {rightPanel === 'forbidden' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--ink2)', padding: '4px 0' }}>
                הוסף קבוצות של תלמידים שלא יכולים לשבת יחד באותו שולחן. כל שני תלמידים מאותה קבוצה לא יושבו ביחד.
              </div>

              {/* קבוצות קיימות */}
              {forbiddenGroups.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: 16,
                  border: '1px dashed var(--bd)', borderRadius: 'var(--rs)' }}>
                  אין שילובים אסורים עדיין
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {forbiddenGroups.map((group, idx) => (
                    <div key={idx} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 6,
                      background: '#fef2f2', border: '1px solid #fecaca',
                      borderRadius: 'var(--rs)', padding: '8px 10px',
                    }}>
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#991b1b', lineHeight: 1.6 }}>
                        🚫 {group.map((id) => students.find((s) => s.id === id)?.name ?? id).join(' · ')}
                      </div>
                      <button
                        onClick={() => removeForbiddenGroup(classroomId, idx)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 14, color: '#dc2626', padding: '0 4px', lineHeight: 1, flexShrink: 0,
                        }}
                        title="הסר שילוב"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* הוספת קבוצה חדשה */}
              {addingGroup ? (
                <div style={{
                  background: 'var(--bg2)', border: '1.5px solid var(--ac)', borderRadius: 'var(--r)',
                  padding: 10,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--ac)' }}>
                    + קבוצה חדשה
                  </div>
                  {/* תלמידים שנבחרו */}
                  {newGroupIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {newGroupIds.map((id) => {
                        const s = students.find((x) => x.id === id);
                        if (!s) return null;
                        return (
                          <span key={id} style={{
                            background: '#fff7ed', border: '1.5px solid var(--ac)',
                            borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}>
                            {s.name}
                            <button
                              onClick={() => setNewGroupIds(newGroupIds.filter((x) => x !== id))}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1, color: '#ea580c' }}
                            >✕</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <input
                    autoFocus
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="🔍 חפש תלמיד להוסיף..."
                    style={{
                      width: '100%', padding: '6px 10px', fontSize: 13,
                      border: '1px solid var(--bd2)', borderRadius: 'var(--rs)',
                      fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box', marginBottom: 6,
                    }}
                  />
                  <div style={{ maxHeight: 150, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
                    {students
                      .filter((s) => !newGroupIds.includes(s.id) && (!groupSearch.trim() || s.name.includes(groupSearch.trim())))
                      .map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setNewGroupIds([...newGroupIds, s.id]); setGroupSearch(''); }}
                          style={{
                            textAlign: 'right', background: 'var(--bg)', border: '1px solid var(--bd)',
                            borderRadius: 'var(--rs)', padding: '5px 10px', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            color: s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)',
                          }}
                        >
                          {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                        </button>
                      ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      disabled={newGroupIds.length < 2}
                      onClick={() => {
                        if (newGroupIds.length >= 2) {
                          addForbiddenGroup(classroomId, newGroupIds);
                          setNewGroupIds([]);
                          setGroupSearch('');
                          setAddingGroup(false);
                        }
                      }}
                      style={{
                        flex: 1, background: newGroupIds.length >= 2 ? 'var(--ac)' : 'var(--bd)',
                        color: '#fff', border: 'none', borderRadius: 'var(--rs)',
                        padding: '7px 0', fontWeight: 800, fontSize: 13,
                        cursor: newGroupIds.length >= 2 ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                      }}
                    >
                      שמור קבוצה {newGroupIds.length >= 2 ? `(${newGroupIds.length})` : '— בחר 2+'}
                    </button>
                    <button
                      onClick={() => { setAddingGroup(false); setNewGroupIds([]); setGroupSearch(''); }}
                      style={{
                        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
                        padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >ביטול</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  style={{
                    background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 'var(--rs)',
                    padding: '9px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  + הוסף שילוב אסור
                </button>
              )}
            </div>
          )}

          {/* ── פאנל תלמידים ── */}
          {rightPanel === 'students' && (
            <div style={{ minWidth: 0 }}>
              <StudentManager classroomId={classroomId} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// שמות מאוחסנים כ"משפחה פרטי" — מחזיר [שם פרטי, שם משפחה] לתצוגה בשתי שורות
function getSeatLines(stu: Student): string[] {
  const parts = stu.name.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0]];
  const first  = parts[parts.length - 1];        // שם פרטי = מילה אחרונה
  const family = parts.slice(0, -1).join(' ');   // משפחה = שאר
  return [first, family];
}

// גודל פונט מקסימלי שמתאים לרדיוס ואורך השורות
function calcLineFontSize(lines: string[], r: number): number {
  const availW = r * 1.72;
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const byWidth  = Math.floor(availW / (maxLen * 0.55));
  // שתי שורות + גאפ צריכות להיכנס לקוטר האנכי (r * 2 * 0.75)
  const byHeight = lines.length > 1 ? Math.floor((r * 1.5 - 2) / 2) : Math.floor(r * 0.72);
  return Math.max(9, Math.min(byWidth, byHeight, 23));
}

function HistoryItem({ name, date, onRestore, cloud }: {
  name: string; date: string; onRestore: () => void; cloud?: boolean;
}) {
  const d = new Date(date);
  const dateStr = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--bg)', border: '1px solid var(--bd)',
      borderRadius: 'var(--rs)', padding: '7px 10px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cloud ? '☁ ' : ''}{name || 'סידור ללא שם'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{dateStr} · {timeStr}</div>
      </div>
      <button
        onClick={onRestore}
        style={{
          background: 'var(--ac)', color: '#fff', border: 'none',
          borderRadius: 'var(--rs)', padding: '4px 10px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        שחזר
      </button>
    </div>
  );
}
