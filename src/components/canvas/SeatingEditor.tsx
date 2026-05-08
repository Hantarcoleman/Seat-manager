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
import type { Wall, FixedElement, Desk, Seat, ArrangementWarning, SeatingArrangement } from '../../types';

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
  const [separateGenders, setSeparateGenders] = useState(false);
  const [aiProposals, setAiProposals] = useState<SeatingArrangement[]>([]);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [cloudHistory, setCloudHistory] = useState<import('../../services/cloudSyncService').HistoryEntry[]>([]);
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

  // שיבוצים לתצוגה — בתצוגה מקדימה מציגים ההצעה, אחרת את הנוכחיים
  const displayAssignments = useMemo(() => {
    if (previewIdx !== null && aiProposals[previewIdx]) {
      return aiProposals[previewIdx].assignments;
    }
    return assignments;
  }, [previewIdx, aiProposals, assignments]);

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

  // אזהרות וציון — בתצוגה מקדימה משתמשים בנתוני ההצעה
  const displayWarnings = useMemo((): ArrangementWarning[] => {
    if (!classroom) return [];
    if (previewIdx !== null && aiProposals[previewIdx]) {
      return aiProposals[previewIdx].warnings;
    }
    if (!working) return [];
    return validateAssignments(working, classroom, students, { separateGenders });
  }, [previewIdx, aiProposals, working, classroom, students, separateGenders]);

  const displayScore = useMemo(() => {
    if (previewIdx !== null && aiProposals[previewIdx]) return aiProposals[previewIdx].score;
    return scoreArrangement(displayWarnings);
  }, [previewIdx, aiProposals, displayWarnings]);

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
        const dx = seat.side === 'solo' ? 0 : seat.side === 'left' ? -33 : 33;
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
  const activeSeatQualityStudentId = previewIdx !== null ? null : (draggedStudentId ?? pickedStudentId);

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

      if (stu.tags.includes('needs_front')) { if (zones.has('front_row')) good = true; else bad = true; }
      if (stu.tags.includes('needs_wall') && zones.has('near_wall')) good = true;
      if (stu.tags.includes('distractible') && (zones.has('near_window') || zones.has('near_door'))) bad = true;
      if (stu.tags.includes('better_alone') && seat.side === 'solo') good = true;
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

  if (!classroom) return null;

  // ── פעולות שיבוץ ──────────────────────────────────────────
  const assignToSeat = (seatId: string, studentId: string) => {
    if (previewIdx !== null) return;
    const next = assignments.filter((a) => a.seatId !== seatId && a.studentId !== studentId);
    next.push({ seatId, studentId });
    updateAssignments(classroomId, next);
  };

  const removeFromSeat = (seatId: string) => {
    if (previewIdx !== null) return;
    updateAssignments(classroomId, assignments.filter((a) => a.seatId !== seatId));
  };

  const onSeatClick = (seatId: string) => {
    if (previewIdx !== null) return;
    const occupant = seatToStudentId.get(seatId);
    if (pickedStudentId) {
      if (pinnedSet.has(pickedStudentId)) { setPickedStudentId(null); return; }
      const pickedSeat = studentToSeatId.get(pickedStudentId);
      if (occupant && occupant !== pickedStudentId) {
        if (pinnedSet.has(occupant)) { setPickedStudentId(null); return; }
        if (pickedSeat) {
          const next = assignments.map((a) => {
            if (a.studentId === pickedStudentId) return { seatId, studentId: pickedStudentId };
            if (a.seatId === seatId) return { seatId: pickedSeat, studentId: occupant };
            return a;
          });
          updateAssignments(classroomId, next);
        } else {
          assignToSeat(seatId, pickedStudentId);
        }
      } else {
        assignToSeat(seatId, pickedStudentId);
      }
      setPickedStudentId(null);
    } else if (occupant && !pinnedSet.has(occupant)) {
      setPickedStudentId(occupant);
    }
  };

  const onSeatDblClick = (seatId: string) => {
    if (previewIdx !== null) return;
    const occupant = seatToStudentId.get(seatId);
    if (occupant && !pinnedSet.has(occupant)) {
      removeFromSeat(seatId);
      setPickedStudentId(null);
    }
  };

  const onParkingStudentClick = (studentId: string) => {
    if (previewIdx !== null) return;
    setPickedStudentId(pickedStudentId === studentId ? null : studentId);
  };

  const onParkingDrop = () => {
    if (previewIdx !== null) return;
    if (pickedStudentId && studentToSeatId.has(pickedStudentId)) {
      removeFromSeat(studentToSeatId.get(pickedStudentId)!);
      setPickedStudentId(null);
    }
  };

  const clearAllAssignments = () => {
    if (assignments.length === 0) return;
    if (!confirm(`לנקות את כל ${assignments.length} השיבוצים?`)) return;
    setAiProposals([]); setPreviewIdx(null);
    updateAssignments(classroomId, []);
    clearPins(classroomId);
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
      const next = assignments.map((a) => {
        if (a.seatId === seatId) return { seatId: targetSeatId!, studentId: draggedId };
        if (a.seatId === targetSeatId) return { seatId, studentId: targetOccupant };
        return a;
      });
      updateAssignments(classroomId, next);
    } else {
      updateAssignments(classroomId, assignments.map((a) =>
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

  // ── יצירת 3 הצעות AI ─────────────────────────────────────────
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

        const proposals = [0, 12345, 67890].map((offset) => {
          const raw = generateSeatingArrangement(freeClassroom, freeStudents, {
            candidates: 60, seed: baseSeed + offset, separateGenders,
          });
          const merged = { ...raw, assignments: [...pinnedAssignments, ...raw.assignments] };
          const warnings = validateAssignments(merged, classroom, students, { separateGenders });
          return { ...merged, warnings, score: scoreArrangement(warnings) };
        });

        setAiProposals(proposals);
        setPreviewIdx(0);
        setPickedStudentId(null);
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  const applyProposal = (idx: number) => {
    const proposal = aiProposals[idx];
    if (!proposal) return;
    updateAssignments(classroomId, proposal.assignments);
    setAiProposals([]);
    setPreviewIdx(null);
    setPickedStudentId(null);
  };

  const cancelProposals = () => { setAiProposals([]); setPreviewIdx(null); };

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
    const w = desk.seatCount === 2 ? 134 : 80;
    const h = 76;
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
    const r = isSolo ? 34 : 28;
    const dx = isSolo ? 0 : (seat.side === 'left' ? -33 : 33);

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

    const parts = stu ? stu.name.trim().split(/\s+/) : [];
    const line1 = trunc(parts[0] ?? '', isSolo ? 9 : 7);
    const line2 = trunc(parts.slice(1).join(' '), isSolo ? 9 : 7);
    const fontSize = isSolo ? 10 : 9;
    const lineH = fontSize + 2;
    const textW = Math.round(r * 1.6);
    const textStartY = -Math.round(lineH);
    const pinOff = Math.round(r * 0.68);
    const pinR = 9;
    const textColor = stu
      ? (stu.gender === 'm' ? '#1d4ed8' : stu.gender === 'f' ? '#be185d' : '#1c1917')
      : '#a8a29e';

    const canDrag = !!stu && !isPinned && previewIdx === null;

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
        {stu && (
          <>
            <Text
              x={dx - textW / 2} y={textStartY - lineH / 2}
              width={textW} align="center"
              text={line1} fontSize={fontSize} fontFamily="Heebo" fill={textColor} fontStyle="bold"
              listening={false}
            />
            {line2 && (
              <Text
                x={dx - textW / 2} y={textStartY - lineH / 2 + lineH + 2}
                width={textW} align="center"
                text={line2} fontSize={fontSize} fontFamily="Heebo" fill={textColor}
                listening={false}
              />
            )}
          </>
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
        display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12,
        background: 'var(--bg2)', border: '1px solid var(--bd)',
        borderRadius: 'var(--rs)', padding: '8px 14px',
      }}>
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

      {/* באנר תצוגה מקדימה */}
      {previewIdx !== null && (
        <div style={{
          background: '#fff7ed', border: '2px solid var(--ac)', borderRadius: 'var(--rs)',
          padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            👁 תצוגה מקדימה — הצעה {previewIdx + 1} (לא שמורה)
          </span>
          <button
            onClick={() => applyProposal(previewIdx!)}
            style={{ background: 'var(--ac)', color: '#fff', border: 'none', borderRadius: 'var(--rs)', padding: '6px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ✓ החל
          </button>
          <button
            onClick={cancelProposals}
            style={{ background: 'none', border: '1px solid var(--bd)', borderRadius: 'var(--rs)', padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            ✕ בטל
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
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
              {generating ? '⏳ מחשב...' : '✨ 3 הצעות AI'}
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={separateGenders}
                onChange={(e) => setSeparateGenders(e.target.checked)}
                style={{ width: 15, height: 15 }}
              />
              הפרד בנים/בנות
            </label>
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
            {previewIdx !== null
              ? '👁 תצוגה מקדימה בלבד — לחץ "החל" ליישום או "בטל" לחזרה'
              : pickedStudentId
                ? '👆 לחץ על מושב לשיבוץ · גרור ישירות · לחץ "אזור המתנה" להחזיר'
                : '💡 לחץ/גרור תלמיד מרשימת ההמתנה · לחץ על מושב תפוס להזזה · דאבל-קליק להסרה'}
          </div>

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
          </div>
        </div>

        {/* ── עמודה ימנית ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* הצעות AI */}
          {aiProposals.length > 0 && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
              padding: 12, boxShadow: 'var(--sh)',
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>🤖 הצעות AI — בחר אחת</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {aiProposals.map((p, i) => {
                  const hard = p.warnings.filter((w) => w.type === 'hard').length;
                  const soft = p.warnings.filter((w) => w.type === 'soft').length;
                  const isActive = previewIdx === i;
                  return (
                    <div
                      key={i}
                      onClick={() => setPreviewIdx(i)}
                      style={{
                        background: isActive ? '#fff7ed' : 'var(--bg)',
                        border: `1.5px solid ${isActive ? 'var(--ac)' : 'var(--bd)'}`,
                        borderRadius: 'var(--rs)', padding: '8px 10px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 800, fontSize: 13 }}>הצעה {i + 1}</span>
                      <span style={{
                        background: p.score >= 80 ? '#16a34a' : p.score >= 60 ? '#ca8a04' : '#dc2626',
                        color: '#fff', fontSize: 12, fontWeight: 800, padding: '2px 8px', borderRadius: 10,
                      }}>{p.score}</span>
                      <span style={{ fontSize: 11, color: 'var(--ink3)', flex: 1 }}>
                        {hard} חמורות · {soft} מומלצות
                      </span>
                      {isActive && (
                        <button
                          onClick={(e) => { e.stopPropagation(); applyProposal(i); }}
                          style={{
                            background: 'var(--ac)', color: '#fff', border: 'none',
                            borderRadius: 'var(--rs)', padding: '4px 10px', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          החל
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* הסבר שיבוץ */}
          {placementExplanation && (
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
              padding: 12, boxShadow: 'var(--sh)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                🔍 {students.find((s) => s.id === explanationStudentId)?.name ?? ''}
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
                return (
                  <button
                    key={s.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('text/plain', s.id); setDraggedStudentId(s.id); }}
                    onDragEnd={() => setDraggedStudentId(null)}
                    onMouseEnter={() => setHoveredStudentId(s.id)}
                    onMouseLeave={() => setHoveredStudentId(null)}
                    onClick={(e) => { e.stopPropagation(); onParkingStudentClick(s.id); }}
                    style={{
                      background: isP ? '#fff7ed' : bg,
                      color, border: isP ? '2px solid var(--ac)' : `1.5px solid ${border}`,
                      borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 13, fontWeight: 700,
                      cursor: 'grab', fontFamily: 'inherit', textAlign: 'right',
                    }}
                  >
                    {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                  </button>
                );
              })}
            </div>
          </div>

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
      </div>
    </div>
  );
}

function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
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
