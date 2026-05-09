import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useClassroomStore } from '../store/classroomStore';
import RoomEditor from '../components/canvas/RoomEditor';
import DeskLayoutEditor from '../components/canvas/DeskLayoutEditor';
import ClassroomNav from '../components/canvas/ClassroomNav';

type EditorTab = 'room' | 'desks';

export default function ClassroomSetup() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const classroom = useClassroomStore((s) => (id ? s.classrooms[id] : undefined));
  const setCurrent = useClassroomStore((s) => s.setCurrent);
  const [editorTab, setEditorTab] = useState<EditorTab>('room');

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

  return (
    <div>
      <ClassroomNav classroomId={classroom.id} classroomName={classroom.name} />
      {/* פאנל מאוחד עם לשוניות */}
      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r)',
        boxShadow: 'var(--sh)',
        overflow: 'hidden',
        marginTop: 16,
      }}>
        {/* רצועת לשוניות */}
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '10px 12px',
          borderBottom: '1px solid var(--bd)',
          background: 'var(--bg)',
        }}>
          {([
            { key: 'room',  label: '🏛 מבנה ורצפה' },
            { key: 'desks', label: '🪑 שולחנות' },
          ] as { key: EditorTab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setEditorTab(key)}
              style={{
                padding: '7px 18px',
                borderRadius: 'var(--rs)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 600,
                fontSize: 14,
                transition: 'background 0.15s, color 0.15s',
                background: editorTab === key ? 'var(--ac)' : 'transparent',
                color: editorTab === key ? '#fff' : 'var(--ink2)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* תוכן הלשונית הפעילה */}
        {editorTab === 'room'  && <RoomEditor      classroomId={classroom.id} />}
        {editorTab === 'desks' && <DeskLayoutEditor classroomId={classroom.id} />}
      </div>
    </div>
  );
}
