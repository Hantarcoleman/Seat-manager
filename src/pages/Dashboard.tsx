import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useClassroomStore } from '../store/classroomStore';
import { buildGenericClassroom } from '../services/classroomTemplates';

// תצוגה מקדימה של גריד שולחנות
function GridPreview({ rows, cols }: { rows: number; cols: number }) {
  const W = 220, H = 140;
  const M = 14; // margin
  const boardH = 10;
  const deskW = Math.min(38, (W - M * 2) / Math.max(1, cols * 1.25));
  const deskH = Math.min(22, (H - M * 2 - boardH - 8) / Math.max(1, rows * 1.3));
  const colGap = cols > 1 ? (W - M * 2 - deskW * cols) / (cols - 1) : 0;
  const rowGap = rows > 1 ? (H - M * 2 - boardH - 8 - deskH * rows) / (rows - 1) : 0;

  const desks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      desks.push({
        x: M + c * (deskW + colGap),
        y: M + boardH + 8 + r * (deskH + rowGap),
      });
    }
  }

  return (
    <svg width={W} height={H} style={{ border: '1px solid var(--bd)', borderRadius: 8, background: '#fff', display: 'block' }}>
      {/* לוח */}
      <rect x={M} y={M} width={W - M * 2} height={boardH} rx={2} fill="#7c3aed" opacity={0.75} />
      <text x={W / 2} y={M + 7} textAnchor="middle" fontSize={6} fill="#fff" fontFamily="Heebo">לוח</text>
      {/* שולחנות */}
      {desks.map((d, i) => (
        <rect key={i} x={d.x} y={d.y} width={deskW} height={deskH} rx={2}
              fill="#e7e5e4" stroke="#a8a29e" strokeWidth={0.8} />
      ))}
    </svg>
  );
}

const getSavedInt = (key: string, def: number) => {
  const v = parseInt(localStorage.getItem(key) ?? '', 10);
  return isNaN(v) ? def : Math.max(1, Math.min(10, v));
};

export default function Dashboard() {
  const navigate = useNavigate();
  const classrooms = useClassroomStore((s) => s.classrooms);
  const createClassroom = useClassroomStore((s) => s.createClassroom);
  const deleteClassroom = useClassroomStore((s) => s.deleteClassroom);
  const setCurrent = useClassroomStore((s) => s.setCurrent);
  const addWall = useClassroomStore((s) => s.addWall);
  const addFixedElement = useClassroomStore((s) => s.addFixedElement);
  const addDesk = useClassroomStore((s) => s.addDesk);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [tplRows, setTplRows] = useState(() => getSavedInt('sg_tpl_rows', 4));
  const [tplCols, setTplCols] = useState(() => getSavedInt('sg_tpl_cols', 5));
  const [withTemplate, setWithTemplate] = useState(true);

  const list = Object.values(classrooms);

  const setRows = (v: number) => { setTplRows(v); localStorage.setItem('sg_tpl_rows', String(v)); };
  const setCols = (v: number) => { setTplCols(v); localStorage.setItem('sg_tpl_cols', String(v)); };

  const onCreate = () => {
    const name = newName.trim() || 'כיתה חדשה';
    const id = createClassroom(name);
    if (withTemplate) {
      const cls = useClassroomStore.getState().classrooms[id];
      const tpl = buildGenericClassroom(tplRows, tplCols, cls.width, cls.height);
      tpl.walls.forEach((w) => addWall(w));
      tpl.fixedElements.forEach((el) => addFixedElement(el));
      tpl.desks.forEach((d) => addDesk(d.desk, d.seats));
    }
    setShowNew(false);
    setNewName('');
    navigate(`/classroom/${id}/seating`);
  };

  return (
    <div>
      <div className="privacy-note" style={{ marginBottom: 20 }}>
        🔒 המידע נשמר מקומית במכשיר שלך ואינו נשלח לשרת.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>הכיתות שלי</h2>
        <button
          onClick={() => setShowNew(true)}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '10px 20px',
            fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          + כיתה חדשה
        </button>
      </div>

      {showNew && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          padding: 20, marginBottom: 20, boxShadow: 'var(--sh)',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 14px' }}>🏫 יצירת כיתה חדשה</h3>

          <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>שם הכיתה</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="למשל: ז&apos;1, ח&apos;3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            style={{
              width: '100%', padding: '10px 14px', fontSize: 15,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box', marginBottom: 16,
            }}
          />

          <div style={{
            background: 'var(--abg)', border: '1px solid var(--abd)', borderRadius: 'var(--rs)',
            padding: 12, marginBottom: 16,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={withTemplate}
                onChange={(e) => setWithTemplate(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span style={{ fontWeight: 800, fontSize: 14, color: '#9a3412' }}>
                התחל עם תבנית בניית כיתה רגילה (מומלץ)
              </span>
            </label>
            <div style={{ fontSize: 12, color: '#9a3412', marginBottom: withTemplate ? 12 : 0 }}>
              חדר מלבני עם לוח, שולחן מורה, וגריד שולחנות. אפשר לערוך הכל אחר כך.
            </div>

            {withTemplate && (
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  <label style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3, color: '#9a3412' }}>שורות (מימין לשמאל)</div>
                    <input
                      type="number" min={1} max={10} value={tplRows}
                      onChange={(e) => setRows(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 15, fontWeight: 700,
                        border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                        fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                  <label style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3, color: '#9a3412' }}>טורים (מלמעלה למטה)</div>
                    <input
                      type="number" min={1} max={10} value={tplCols}
                      onChange={(e) => setCols(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 15, fontWeight: 700,
                        border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                        fontFamily: 'inherit', textAlign: 'center', boxSizing: 'border-box',
                      }}
                    />
                  </label>
                  <div style={{ alignSelf: 'flex-end', fontSize: 12, color: '#9a3412', paddingBottom: 8, whiteSpace: 'nowrap' }}>
                    = <strong>{tplRows * tplCols}</strong> שולחנות
                  </div>
                </div>
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
                  <GridPreview rows={tplRows} cols={tplCols} />
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCreate}
              style={{
                background: 'var(--ac)', color: '#fff', border: 'none',
                borderRadius: 'var(--rs)', padding: '10px 22px', fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
              }}
            >
              צור כיתה
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(''); }}
              style={{
                background: 'transparent', color: 'var(--ink2)',
                border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--bd2)', borderRadius: 'var(--r)',
          padding: 48, textAlign: 'center', color: 'var(--ink3)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏫</div>
          <p style={{ margin: 0, fontSize: 16 }}>אין עדיין כיתות. צור כיתה חדשה כדי להתחיל.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
        }}>
          {list.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
                padding: 16, boxShadow: 'var(--sh)', cursor: 'pointer',
                transition: 'transform .1s, box-shadow .1s',
              }}
              onClick={() => { setCurrent(c.id); navigate(`/classroom/${c.id}/seating`); }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shl)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--sh)'; }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 12 }}>
                {c.desks.length} שולחנות · {c.seats.length} מושבים · {c.walls.length} קירות
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`למחוק את "${c.name}"?`)) deleteClassroom(c.id);
                  }}
                  style={{
                    background: 'transparent', color: 'var(--rd)',
                    border: '1px solid var(--bd2)', borderRadius: 'var(--rs)',
                    padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  מחק
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
