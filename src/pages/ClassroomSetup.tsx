import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useClassroomStore } from '../store/classroomStore';
import RoomEditor from '../components/canvas/RoomEditor';
import DeskLayoutEditor from '../components/canvas/DeskLayoutEditor';
import ClassroomNav from '../components/canvas/ClassroomNav';
import MobileClassroomView from '../components/mobile/MobileClassroomView';
import { useIsMobile } from '../hooks/useIsMobile';

export default function ClassroomSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classroom = useClassroomStore((s) => (id ? s.classrooms[id] : undefined));
  const setCurrent = useClassroomStore((s) => s.setCurrent);
  const isMobile = useIsMobile();

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
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '10px 20px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          חזרה לרשימת כיתות
        </button>
      </div>
    );
  }

  if (isMobile) {
    return <MobileClassroomView classroomId={classroom.id} initialTab="room" />;
  }

  return (
    <div>
      <ClassroomNav classroomId={classroom.id} classroomName={classroom.name} />
      {/* פאנל מאוחד — מבנה חדר ושולחנות יחד, ללא לשוניות נפרדות */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r)',
        boxShadow: 'var(--sh)',
        overflow: 'hidden',
        marginTop: 16,
      }}>
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink2)', marginBottom: 12 }}>
            🏛 מבנה החדר
          </div>
          <RoomEditor classroomId={classroom.id} />
        </div>
        <div style={{ borderTop: '2px solid var(--bd)', padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink2)', marginBottom: 12 }}>
            🪑 שולחנות
          </div>
          <DeskLayoutEditor classroomId={classroom.id} />
        </div>
      </div>
    </div>
  );
}
