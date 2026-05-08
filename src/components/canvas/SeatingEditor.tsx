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

  // טעינת היסטוריה מהענן כשמציגים אותה
  useEffect(() => {
    if (!showHistory || !isSupabaseEnabled() || !user) return;
    loadHistory(classroomId).then(setCloudHistory);
  }, [showHistory, classroomId, user]);

  // יוצר working אם לא קיים
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

  const assignments = working?.assignments ?? [];

  const seatToStudentId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments) m.set(a.seatId, a.studentId);
    return m;
  }, [assignments]);

  const studentToSeatId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of assignments) m.set(a.studentId, a.seatId);
    return m;
  }, [assignments]);

  const unassigned = useMemo(() => {
    return students.filter((s) => !studentToSeatId.has(s.id));
  }, [students, studentToSeatId]);

  const filteredUnassigned = useMemo(() => {
    if (!search.trim()) return unassigned;
    return unassigned.filter((s) => s.name.includes(search.trim()));
  }, [unassigned, search]);

  const aloneCount = useMemo(
    () => students.filter((s) => s.tags.includes('better_alone')).length,
    [students]
  );
  const availableSeats = classroom ? classroom.seats.length - assignments.length : 0;

  const warnings = useMemo(() => {
    if (!working || !classroom) return [] as ArrangementWarning[];
    return validateAssignments(working, classroom, students);
  }, [working, classroom, students]);

  const score = scoreArrangement(warnings);

  // האם המושב או התלמיד מסומן באזהרה?
  const flaggedSeatIds = useMemo(() => {
    const s = new Set<string>();
    warnings.forEach((w) => w.seatIds?.forEach((id) => s.add(id)));
    return s;
  }, [warnings]);

  if (!classroom) return null;

  // ── פעולות שיבוץ ────────────────────────────────
  const assignToSeat = (seatId: string, studentId: string) => {
    const next = assignments.filter((a) => a.seatId !== seatId && a.studentId !== studentId);
    next.push({ seatId, studentId });
    updateAssignments(classroomId, next);
  };

  const removeFromSeat = (seatId: string) => {
    updateAssignments(classroomId, assignments.filter((a) => a.seatId !== seatId));
  };

  const onSeatClick = (seatId: string) => {
    const occupant = seatToStudentId.get(seatId);
    if (pickedStudentId) {
      if (pinnedSet.has(pickedStudentId)) { setPickedStudentId(null); return; }
      const pickedSeat = studentToSeatId.get(pickedStudentId);
      if (occupant && occupant !== pickedStudentId) {
        // החלפת מקומות בין שני תלמידים יושבים
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

  // דאבל קליק על מושב תפוס — החזר תלמיד לרשימת ההמתנה
  const onSeatDblClick = (seatId: string) => {
    const occupant = seatToStudentId.get(seatId);
    if (occupant && !pinnedSet.has(occupant)) {
      removeFromSeat(seatId);
      setPickedStudentId(null);
    }
  };

  const onParkingStudentClick = (studentId: string) => {
    if (pickedStudentId === studentId) {
      setPickedStudentId(null);
    } else {
      setPickedStudentId(studentId);
    }
  };

  // לחיצה על "אזור המתנה" עם נבחר תפוס — מסירה אותו מהמושב
  const onParkingDrop = () => {
    if (pickedStudentId && studentToSeatId.has(pickedStudentId)) {
      const seatId = studentToSeatId.get(pickedStudentId)!;
      removeFromSeat(seatId);
      setPickedStudentId(null);
    }
  };

  const clearAllAssignments = () => {
    if (assignments.length === 0) return;
    if (!confirm(`לנקות את כל ${assignments.length} השיבוצים?`)) return;
    updateAssignments(classroomId, []);
    clearPins(classroomId);
    setPickedStudentId(null);
  };

  // יצירת סידור AI — מריץ 60 ניסיונות, שומר תלמידים נעוצים במקומם
  const generateWithAI = () => {
    if (students.length === 0 || classroom.seats.length === 0) return;
    setGenerating(true);
    setTimeout(() => {
      try {
        // תלמידים נעוצים — שמור את שיבוציהם הנוכחיים
        const pinnedAssignments = assignments.filter((a) => pinnedSet.has(a.studentId));
        const pinnedSeatIds = new Set(pinnedAssignments.map((a) => a.seatId));
        const pinnedStudIds = new Set(pinnedAssignments.map((a) => a.studentId));

        // הרץ AI רק על תלמידים ומושבים שאינם נעוצים
        const freeStudents = students.filter((s) => !pinnedStudIds.has(s.id));
        const freeClassroom = {
          ...classroom,
          seats: classroom.seats.filter((s) => !pinnedSeatIds.has(s.id)),
        };

        const result = generateSeatingArrangement(freeClassroom, freeStudents, { candidates: 60 });
        updateAssignments(classroomId, [...pinnedAssignments, ...result.assignments]);
        setPickedStudentId(null);
      } finally {
        setGenerating(false);
      }
    }, 30);
  };

  // ייצוא PDF — לוכד את הקנבס ומוסיף כותרת
  const exportPdf = () => {
    if (!stageRef.current || !classroom) return;
    exportSeatsPdf(stageRef.current, {
      classroomName: classroom.name,
      teacherName: user?.user_metadata?.full_name ?? user?.email,
      title: `סידור ישיבה — ${classroom.name}`,
    });
  };

  // שמירת סידור עם שם + העלאה להיסטוריה בענן
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

  // שחזור סידור מהיסטוריה
  const restoreFromHistory = (arr: SeatingArrangement) => {
    updateAssignments(classroomId, arr.assignments);
    setPickedStudentId(null);
    setShowHistory(false);
  };

  // ── רינדור ────────────────────────────────────
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
    // רוחב שולחן זוגי מכיל 2 עיגולים r=28 עם dx=±33 → outer edge=61, margin=4 מכל צד
    // גובה אחיד 76 → margin top/bottom: זוגי 76/2-28=10, יחיד 76/2-34=4
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
    // עיגול זוגי: r=28, dx=±33 — עיגול יחיד: r=34
    const isSolo = seat.side === 'solo';
    const r = isSolo ? 34 : 28;
    const dx = isSolo ? 0 : (seat.side === 'left' ? -33 : 33);

    const studentId = seatToStudentId.get(seat.id);
    const stu = studentId ? students.find((s) => s.id === studentId) : null;
    const isPicked = pickedStudentId && studentId === pickedStudentId;
    const isFlagged = flaggedSeatIds.has(seat.id);
    const isPinned = studentId ? pinnedSet.has(studentId) : false;

    const bgColor = stu
      ? (stu.gender === 'm' ? '#dbeafe' : stu.gender === 'f' ? '#fce7f3' : '#fff')
      : '#fff';
    const textColor = stu
      ? (stu.gender === 'm' ? '#1d4ed8' : stu.gender === 'f' ? '#be185d' : '#1c1917')
      : '#a8a29e';
    const strokeColor = isPicked ? '#ea580c' : isPinned ? '#7c3aed' : isFlagged ? '#dc2626' : (stu ? '#16a34a' : '#a8a29e');
    const strokeW = isPicked || isFlagged || isPinned ? 3 : 2;

    // שם פרטי בשורה 1, שם משפחה בשורה 2
    const parts = stu ? stu.name.trim().split(/\s+/) : [];
    const firstName = parts[0] ?? '';
    const lastName = parts.slice(1).join(' ');
    const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s;
    const maxChars = isSolo ? 9 : 7;
    const line1 = trunc(firstName, maxChars);
    const line2 = trunc(lastName, maxChars);

    // מרכז טקסט: שני שורות 10px גובה + 2px רווח = 22px סה"כ → מתחיל ב-y=-11
    const fontSize = isSolo ? 10 : 9;
    const lineH = fontSize + 2;
    const textW = Math.round(r * 1.6); // רוחב בטוח בתוך העיגול
    const textStartY = -Math.round(lineH);  // שתי שורות ממורכזות: -lineH עד +lineH

    // מיקום כפתור נעיצה — פינה עליונה ימנית של העיגול (~45°)
    const pinOff = Math.round(r * 0.68);
    const pinR = 9;

    return (
      <Group key={seat.id}>
        <Circle
          x={dx} y={0} radius={r}
          fill={bgColor} stroke={strokeColor} strokeWidth={strokeW}
          listening={true}
          onClick={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
          onTap={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
          onDblClick={(e) => { e.cancelBubble = true; onSeatDblClick(seat.id); }}
          onDblTap={(e) => { e.cancelBubble = true; onSeatDblClick(seat.id); }}
        />
        {stu && (
          <>
            <Text
              x={dx - textW / 2} y={textStartY - lineH / 2}
              width={textW} align="center"
              text={line1}
              fontSize={fontSize} fontFamily="Heebo" fill={textColor} fontStyle="bold"
              listening={false}
            />
            {line2 && (
              <Text
                x={dx - textW / 2} y={textStartY - lineH / 2 + lineH + 2}
                width={textW} align="center"
                text={line2}
                fontSize={fontSize} fontFamily="Heebo" fill={textColor}
                listening={false}
              />
            )}
          </>
        )}
        {/* כפתור נעיצה */}
        {stu && (
          <>
            <Circle
              x={dx + pinOff} y={-pinOff} radius={pinR}
              fill={isPinned ? '#7c3aed' : '#e2e8f0'}
              stroke={isPinned ? '#5b21b6' : '#94a3b8'}
              strokeWidth={1}
              listening={true}
              onClick={(e) => { e.cancelBubble = true; togglePin(classroomId, stu.id); }}
              onTap={(e) => { e.cancelBubble = true; togglePin(classroomId, stu.id); }}
            />
            <Text
              x={dx + pinOff - pinR} y={-pinOff - pinR + 1}
              width={pinR * 2} align="center"
              text="📌"
              fontSize={isPinned ? 9 : 8}
              listening={false}
            />
          </>
        )}
      </Group>
    );
  };

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
            <span style={{
              background: stat.color, color: '#fff', borderRadius: 10,
              padding: '2px 9px', fontWeight: 800, fontSize: 13,
            }}>{stat.value}</span>
            <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{stat.label}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start',
      }}>
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
                opacity: generating || students.length === 0 ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {generating ? '⏳ מחשב...' : '✨ צור סידור AI'}
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
                background: 'var(--bg2)', color: 'var(--rd)',
                border: '1.5px solid #fecaca', borderRadius: 'var(--rs)',
                padding: '8px 16px', fontWeight: 700, fontSize: 13,
                cursor: assignments.length > 0 ? 'pointer' : 'not-allowed',
                opacity: assignments.length > 0 ? 1 : 0.5,
                fontFamily: 'inherit',
              }}
            >
              🗑 נקה הכל
            </button>
            <div style={{ marginRight: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
                <strong>{assignments.length}</strong> משובצים · <strong>{unassigned.length}</strong> ממתינים
              </span>
              <span style={{
                background: score >= 80 ? '#16a34a' : score >= 60 ? '#ca8a04' : '#dc2626',
                color: '#fff', fontSize: 13, fontWeight: 800,
                padding: '4px 10px', borderRadius: 12,
              }}>
                ציון: {score}
              </span>
            </div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>
            {pickedStudentId
              ? '👆 לחץ על מושב לשיבוץ. לחץ על "אזור המתנה" להחזיר את התלמיד.'
              : '💡 לחץ על תלמיד באזור ההמתנה ואז על מושב לשיבוץ. לחץ על תלמיד במושב כדי להזיזו.'}
          </div>

          <div style={{
            background: 'var(--bg2)', border: '1.5px solid var(--bd)', borderRadius: 'var(--r)',
            overflow: 'hidden', boxShadow: 'var(--sh)', position: 'relative',
          }}>
            <Stage ref={stageRef}
              width={classroom.width} height={classroom.height}
              style={{ background: '#fff', cursor: pickedStudentId ? 'crosshair' : 'default' }}>
              <Layer>
                {classroom.walls.map(renderWall)}
                {classroom.fixedElements.map(renderTeacherDesk)}
                {classroom.desks.map(renderDesk)}
              </Layer>
            </Stage>
          </div>
        </div>

        {/* ── עמודה ימנית: אזור המתנה + אזהרות ── */}
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
                fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box',
                marginBottom: 8,
              }}
            />
            <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredUnassigned.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: 12 }}>
                  {unassigned.length === 0 ? '✓ כולם משובצים!' : 'אין תוצאות'}
                </div>
              ) : filteredUnassigned.map((s) => {
                const isPicked = pickedStudentId === s.id;
                const bg = s.gender === 'm' ? '#eff6ff' : s.gender === 'f' ? '#fdf2f8' : 'var(--bg)';
                const color = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
                const border = s.gender === 'm' ? '#bfdbfe' : s.gender === 'f' ? '#fbcfe8' : 'var(--bd)';
                return (
                  <button
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); onParkingStudentClick(s.id); }}
                    style={{
                      background: isPicked ? '#fff7ed' : bg,
                      color, border: isPicked ? '2px solid var(--ac)' : `1.5px solid ${border}`,
                      borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
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
              ⚠ התראות ({warnings.length})
            </div>
            {warnings.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--gn)', fontWeight: 600 }}>
                ✓ אין התראות. הסידור מאוזן.
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {warnings.map((w, i) => (
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
              <span style={{ fontSize: 14, fontWeight: 800 }}>
                📅 היסטוריה ({localHistory.length})
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{showHistory ? '▲' : '▼'}</span>
            </button>

            {showHistory && (
              <div style={{ marginTop: 10 }}>
                {/* היסטוריה מקומית */}
                {localHistory.length === 0 && cloudHistory.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--ink3)', textAlign: 'center', padding: 8 }}>
                    אין סידורים שמורים עדיין
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflow: 'auto' }}>
                    {/* סידורים שמורים מקומית */}
                    {localHistory.map((arr) => (
                      <HistoryItem
                        key={arr.id}
                        name={arr.name}
                        date={arr.createdAt}
                        onRestore={() => { restore(arr.id); setShowHistory(false); setPickedStudentId(null); }}
                      />
                    ))}
                    {/* סידורים מהענן שאינם בהיסטוריה המקומית */}
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
    </div>
  );
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
