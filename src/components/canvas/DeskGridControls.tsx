// כפתורי +/- להוספה/הסרה של שולחן מטור או שורה
import type { ReactNode } from 'react';
import { useClassroomStore } from '../../store/classroomStore';
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
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addDesk   = useClassroomStore((s) => s.addDesk);
  const updateDesk = useClassroomStore((s) => s.updateDesk);
  const removeDesk = useClassroomStore((s) => s.removeDesk);

  if (!classroom) return <>{children}</>;

  const columns = detectColumns(classroom.desks);
  const rows    = detectRows(classroom.desks);

  const applyOp = (op: GridOperation) => {
    op.updates.forEach((u) => updateDesk(u.id, { position: u.position }));
    if (op.add) {
      const seats = op.add.seatCount === 2
        ? [{ side: 'left'  as const, autoZones: [] as [] },
           { side: 'right' as const, autoZones: [] as [] }]
        : [{ side: 'solo'  as const, autoZones: [] as [] }];
      addDesk(op.add, seats);
    }
    if (op.removeId) removeDesk(op.removeId);
  };

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
      {/* רצועת כפתורי טורים — מעל הקנבס */}
      <div style={{ height: 40, position: 'relative', width: classroom.width }}>
        {columns.map((col, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: col.mainAxis - 22,
            top: 6,
            display: 'flex', gap: 3,
          }}>
            <button
              style={ADD_BTN}
              title="הוסף שולחן לטור"
              onClick={() => applyOp(columnAddOp(col))}
            >+</button>
            <button
              style={col.desks.length < 2 ? DIS_BTN : REM_BTN}
              title="הסר שולחן מהטור"
              onClick={() => col.desks.length >= 2 && applyOp(columnRemoveOp(col))}
            >−</button>
          </div>
        ))}
      </div>

      {/* קנבס + רצועת כפתורי שורות מימין */}
      <div style={{ display: 'flex' }}>
        {children}
        <div style={{ width: 30, position: 'relative', flexShrink: 0 }}>
          {rows.map((row, i) => (
            <div key={i} style={{
              position: 'absolute',
              top: row.mainAxis - 22,
              left: 4,
              display: 'flex', flexDirection: 'column', gap: 3,
            }}>
              <button
                style={ADD_BTN}
                title="הוסף שולחן לשורה"
                onClick={() => applyOp(rowAddOp(row))}
              >+</button>
              <button
                style={row.desks.length < 2 ? DIS_BTN : REM_BTN}
                title="הסר שולחן מהשורה"
                onClick={() => row.desks.length >= 2 && applyOp(rowRemoveOp(row))}
              >−</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
