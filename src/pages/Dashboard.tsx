import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useClassroomStore } from '../store/classroomStore';

export default function Dashboard() {
  const navigate = useNavigate();
  const classrooms = useClassroomStore((s) => s.classrooms);
  const createClassroom = useClassroomStore((s) => s.createClassroom);
  const deleteClassroom = useClassroomStore((s) => s.deleteClassroom);
  const setCurrent = useClassroomStore((s) => s.setCurrent);

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const list = Object.values(classrooms);

  const onCreate = () => {
    const name = newName.trim() || 'כיתה חדשה';
    const id = createClassroom(name);
    setShowNew(false);
    setNewName('');
    navigate(`/classroom/${id}/setup`);
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
            background: 'var(--ac)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--rs)',
            padding: '10px 20px',
            fontWeight: 800,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          + כיתה חדשה
        </button>
      </div>

      {showNew && (
        <div style={{
          background: 'var(--bg2)',
          border: '1px solid var(--bd)',
          borderRadius: 'var(--r)',
          padding: 20,
          marginBottom: 20,
          boxShadow: 'var(--sh)',
        }}>
          <label style={{ display: 'block', fontWeight: 700, marginBottom: 8 }}>שם הכיתה</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="למשל: ז&apos;1, ח&apos;3"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && onCreate()}
            style={{
              width: '100%',
              padding: '10px 14px',
              fontSize: 15,
              border: '1.5px solid var(--bd2)',
              borderRadius: 'var(--rs)',
              fontFamily: 'inherit',
              direction: 'rtl',
              boxSizing: 'border-box',
              marginBottom: 12,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCreate}
              style={{
                background: 'var(--ac)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--rs)',
                padding: '10px 20px',
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              צור
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(''); }}
              style={{
                background: 'transparent',
                color: 'var(--ink2)',
                border: '1.5px solid var(--bd2)',
                borderRadius: 'var(--rs)',
                padding: '10px 20px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <div style={{
          background: 'var(--bg2)',
          border: '1px dashed var(--bd2)',
          borderRadius: 'var(--r)',
          padding: 48,
          textAlign: 'center',
          color: 'var(--ink3)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏫</div>
          <p style={{ margin: 0, fontSize: 16 }}>אין עדיין כיתות. צור כיתה חדשה כדי להתחיל.</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 12,
        }}>
          {list.map((c) => (
            <div
              key={c.id}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--bd)',
                borderRadius: 'var(--r)',
                padding: 16,
                boxShadow: 'var(--sh)',
                cursor: 'pointer',
                transition: 'transform .1s, box-shadow .1s',
              }}
              onClick={() => { setCurrent(c.id); navigate(`/classroom/${c.id}/setup`); }}
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
                    background: 'transparent',
                    color: 'var(--rd)',
                    border: '1px solid var(--bd2)',
                    borderRadius: 'var(--rs)',
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
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
