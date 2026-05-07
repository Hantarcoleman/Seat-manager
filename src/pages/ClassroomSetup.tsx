import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useClassroomStore } from '../store/classroomStore';
import RoomEditor from '../components/canvas/RoomEditor';

export default function ClassroomSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classroom = useClassroomStore((s) => (id ? s.classrooms[id] : undefined));
  const setCurrent = useClassroomStore((s) => s.setCurrent);

  useEffect(() => {
    if (id) setCurrent(id);
  }, [id, setCurrent]);

  if (!classroom) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)' }}>
        <p>הכיתה לא נמצאה.</p>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'var(--ac)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--rs)',
            padding: '10px 20px',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          חזרה לרשימת כיתות
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Link to="/" style={{ color: 'var(--ac)', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          ← הכיתות שלי
        </Link>
        <span style={{ color: 'var(--ink3)' }}>·</span>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{classroom.name} — מבנה הכיתה</h2>
      </div>

      <RoomEditor classroomId={classroom.id} />
    </div>
  );
}
