// כפתורי +/- להוספה/הסרה של שולחן מטור או שורה
import type { ReactNode } from 'react';
import { useClassroomStore } from '../../store/classroomStore';
import { useArrangementStore } from '../../store/arrangementStore';
import {
  detectColumns, detectRows,
  columnAddOp, columnRemoveOp,
  rowAddOp, rowRemoveOp,
} from '../../services/deskGridService';
import type { GridOperation } from '../../services/deskGridService';

interface Props {
  classroomId: string;
  children: ReactNode;
}

const BTN_BASE: React.CSSProperties = {
  width: 20, height: 20,
  border: 'none', borderRadius: 4,
  fontSize: 15, lineHeight: '1',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, fontWeight: 900,
};

const ADD_BTN: React.CSSProperties = { ...BTN_BASE, background: '#16a34a', color: '#fff' };
const REM_BTN: React.CSSProperties = { ...BTN_BASE, background: '#dc2626', color: '#fff' };
const DIS_BTN: React.CSSProperties = { ...BTN_BASE, background: '#d1d5db', color: '#9ca3af', cursor: 'not-allowed' };

export default function DeskGridControls({ classroomId, children }: Props) {
  const classroom      = useClassroomStore((s) => s.classrooms[classroomId]);
  const addDesk        = useClassroomStore((s) => s.addDesk);
  const updateDesk     = useClassroomStore((s) => s.updateDesk);
  const removeDesk     = useClassroomStore((s) => s.removeDesk);
  const workingArr     = useArrangementStore((s) => s.workingByClassroom[classroomId]);
  const updateAssignments = useArrangementStore((s) => s.updateAssignments);
  const setParked      = useArrangementStore((s) => s.setParked);

  if (!classroom) return <>{children}</>;

  const columns = detectColumns(classroom.desks);
  const rows    = detectRows(classroom.desks);
  const bounds  = { width: classroom.width, height: classroom.height };

  const applyOp = (op: GridOperation) => {
    if (op.refused) return;
    op.updates.forEach((u) => updateDesk(u.id, { position: u.position }));
    if (op.add) {
      const seats = op.add.seatCount === 2
        ? [{ side: 'left'  as const, autoZones: [] as [] },
           { side: 'right' as const, autoZones: [] as [] }]
        : [{ side: 'solo'  as const, autoZones: [] as [] }];
      addDesk(op.add, seats);
    }
    if (op.removeId) {
      // העבר תלמידים משובצים לאזור ההמתנה לפני מחיקת השולחן
      if (workingArr) {
        const deskSeatIds = new Set(
          classroom.seats.filter((s) => s.deskId === op.removeId).map((s) => s.id)
        );
        const displaced = workingArr.assignments
          .filter((a) => deskSeatIds.has(a.seatId))
          .map((a) => a.studentId);
        if (displaced.length > 0) {
          updateAssignments(classroomId, workingArr.assignments.filter((a) => !deskSeatIds.has(a.seatId)));
          setParked(classroomId, [...new Set([...workingArr.parkedStudentIds, ...displaced])]);
        }
      }
      removeDesk(op.removeId);
    }
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
      {/* רצועת כפתורי טורים — מעל הקנבס */}
      <div style={{ height: 40, position: 'relative', width: classroom.width }}>
        {columns.map((col, i) => {
          const colOp = columnAddOp(col, bounds);
          const canAdd = !colOp.refused;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: col.mainAxis - 22,
              top: 6,
              display: 'flex', gap: 3,
            }}>
              <button
                style={canAdd ? ADD_BTN : DIS_BTN}
                title={canAdd ? 'הוסף שולחן לטור' : 'אין מקום לשולחן נוסף בטור'}
                onClick={() => canAdd && applyOp(colOp)}
              >+</button>
              <button
                style={col.desks.length < 2 ? DIS_BTN : REM_BTN}
                title="הסר שולחן מהטור"
                onClick={() => col.desks.length >= 2 && applyOp(columnRemoveOp(col, bounds))}
              >−</button>
            </div>
          );
        })}
      </div>

      {/* קנבס + רצועת כפתורי שורות מימין */}
      <div style={{ display: 'flex' }}>
        {children}
        <div style={{ width: 30, position: 'relative', flexShrink: 0 }}>
          {rows.map((row, i) => {
            const rowOp = rowAddOp(row, bounds);
            const canAdd = !rowOp.refused;
            return (
              <div key={i} style={{
                position: 'absolute',
                top: row.mainAxis - 22,
                left: 4,
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <button
                  style={canAdd ? ADD_BTN : DIS_BTN}
                  title={canAdd ? 'הוסף שולחן לשורה' : 'אין מקום לשולחן נוסף בשורה'}
                  onClick={() => canAdd && applyOp(rowOp)}
                >+</button>
                <button
                  style={row.desks.length < 2 ? DIS_BTN : REM_BTN}
                  title="הסר שולחן מהשורה"
                  onClick={() => row.desks.length >= 2 && applyOp(rowRemoveOp(row, bounds))}
                >−</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
