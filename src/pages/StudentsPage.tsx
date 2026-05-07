import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useClassroomStore } from '../store/classroomStore';
import StudentManager from '../components/students/StudentManager';
import ClassroomNav from '../components/canvas/ClassroomNav';

export default function StudentsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classroom = useClassroomStore((s) => (id ? s.classrooms[id] : undefined));
  const setCurrent = useClassroomStore((s) => s.setCurrent);

  useEffect(() => { if (id) setCurrent(id); }, [id, setCurrent]);

  if (!classroom) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)' }}>
        <p>הכיתה לא נמצאה.</p>
        <button onClick={() => navigate('/')} style={{
          background: 'var(--ac)', color: '#fff', border: 'none',
          borderRadius: 'var(--rs)', padding: '10px 20px', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>חזרה לרשימת כיתות</button>
      </div>
    );
  }

  return (
    <div>
      <ClassroomNav classroomId={classroom.id} classroomName={classroom.name} />
      <StudentManager classroomId={classroom.id} />
    </div>
  );
}
