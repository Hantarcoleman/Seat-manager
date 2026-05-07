import { useState, useEffect, useMemo, useRef } from 'react';
import { Stage, Layer, Line, Rect, Group, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import { useClassroomStore } from '../../store/classroomStore';
import { useStudentsStore } from '../../store/studentsStore';
import { useArrangementStore } from '../../store/arrangementStore';
import { validateAssignments, scoreArrangement } from '../../services/seatingValidator';
import type { Wall, FixedElement, Desk, Seat, ArrangementWarning } from '../../types';

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

  const [pickedStudentId, setPickedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const stageRef = useRef<Konva.Stage>(null);

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
      // יש תלמיד נבחר — אם המקום פנוי, השב אותו; אם תפוס, החלף
      assignToSeat(seatId, pickedStudentId);
      setPickedStudentId(null);
    } else if (occupant) {
      // אין נבחר ולחצנו על תלמיד תפוס — בחר אותו להזזה
      setPickedStudentId(occupant);
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
    setPickedStudentId(null);
  };

  // אוטו-שיבוץ פשוט: ממלא תלמידים לא משובצים במושבים פנויים בסדר אקראי
  const autoFillSimple = () => {
    const emptySeats = classroom.seats.filter((s) => !seatToStudentId.has(s.id));
    if (emptySeats.length === 0 || unassigned.length === 0) return;
    const shuffled = [...unassigned].sort(() => Math.random() - 0.5);
    const next = [...assignments];
    let i = 0;
    for (const seat of emptySeats) {
      if (i >= shuffled.length) break;
      next.push({ seatId: seat.id, studentId: shuffled[i].id });
      i++;
    }
    updateAssignments(classroomId, next);
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
    const w = desk.seatCount === 2 ? 130 : 80;
    const h = 70;
    return (
      <Group key={desk.id} x={desk.position.x} y={desk.position.y} rotation={desk.rotation} listening={false}>
        <Rect x={-w / 2} y={-h / 2} width={w} height={h}
              fill="#e7e5e4" stroke="#78716c" strokeWidth={1.5} cornerRadius={6} />
        {seats.map((seat) => renderSeat(seat))}
      </Group>
    );
  };

  const renderSeat = (seat: Seat) => {
    const dx = seat.side === 'solo' ? 0 : (seat.side === 'left' ? -32 : 32);
    const studentId = seatToStudentId.get(seat.id);
    const stu = studentId ? students.find((s) => s.id === studentId) : null;
    const isPicked = pickedStudentId && studentId === pickedStudentId;
    const isFlagged = flaggedSeatIds.has(seat.id);

    // צבע לפי מין
    const bgColor = stu
      ? (stu.gender === 'm' ? '#dbeafe' : stu.gender === 'f' ? '#fce7f3' : '#fff')
      : '#fff';
    const textColor = stu
      ? (stu.gender === 'm' ? '#1d4ed8' : stu.gender === 'f' ? '#be185d' : '#1c1917')
      : '#a8a29e';
    const strokeColor = isPicked ? '#ea580c' : isFlagged ? '#dc2626' : (stu ? '#16a34a' : '#a8a29e');
    const strokeW = isPicked || isFlagged ? 3 : 2;

    // טקסט שם — חיתוך אם ארוך
    const displayName = stu ? (stu.name.length > 11 ? stu.name.slice(0, 10) + '…' : stu.name) : '';

    return (
      <Group key={seat.id}>
        <Circle
          x={dx} y={0} radius={22}
          fill={bgColor} stroke={strokeColor} strokeWidth={strokeW}
          listening={true}
          onClick={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
          onTap={(e) => { e.cancelBubble = true; onSeatClick(seat.id); }}
        />
        {stu && (
          <Text
            x={dx - 26} y={-5}
            width={52} align="center"
            text={displayName}
            fontSize={10} fontFamily="Heebo" fill={textColor} fontStyle="bold"
            listening={false}
          />
        )}
      </Group>
    );
  };

  return (
    <div>
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
              onClick={autoFillSimple}
              disabled={unassigned.length === 0 || classroom.seats.length === assignments.length}
              style={{
                background: 'var(--ac)', color: '#fff', border: 'none',
                borderRadius: 'var(--rs)', padding: '8px 16px', fontWeight: 800, fontSize: 13,
                cursor: unassigned.length > 0 ? 'pointer' : 'not-allowed',
                opacity: unassigned.length > 0 ? 1 : 0.5,
                fontFamily: 'inherit',
              }}
            >
              🎲 השלם אקראית
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
              <div style={{ maxHeight: 320, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        </div>
      </div>
    </div>
  );
}
