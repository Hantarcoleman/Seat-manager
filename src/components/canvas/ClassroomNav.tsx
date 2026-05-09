import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useClassroomStore } from '../../store/classroomStore';

interface Props {
  classroomId: string;
  classroomName: string;
}

const TABS = [
  { path: 'seating', label: '📋 ניהול תלמידים ומקומות ישיבה' },
  { path: 'setup',   label: '🏗 עריכת קירות ושולחנות' },
];

export default function ClassroomNav({ classroomId, classroomName }: Props) {
  const location = useLocation();
  const currentTab = location.pathname.split('/').pop();
  const renameClassroom = useClassroomStore((s) => s.renameClassroom);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(classroomName);

  // סנכרן עם prop אם השם השתנה מבחוץ
  useEffect(() => { setEditName(classroomName); }, [classroomName]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== classroomName) renameClassroom(classroomId, trimmed);
    else setEditName(classroomName);
    setEditing(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Link to="/" style={{ color: 'var(--ac)', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          ← הכיתות שלי
        </Link>
        <span style={{ color: 'var(--ink3)' }}>·</span>

        {editing ? (
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setEditName(classroomName); setEditing(false); }
            }}
            autoFocus
            style={{
              fontSize: 20, fontWeight: 800, border: 'none',
              borderBottom: '2px solid var(--ac)', outline: 'none',
              background: 'transparent', fontFamily: 'inherit',
              color: 'var(--ink)', padding: '0 2px', minWidth: 80,
            }}
          />
        ) : (
          <h2
            style={{ fontSize: 20, fontWeight: 800, margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            title="לחץ פעמיים לעריכת שם"
            onDoubleClick={() => setEditing(true)}
          >
            {classroomName}
            <span style={{ fontSize: 13, color: 'var(--ink3)', fontWeight: 400 }}>✎</span>
          </h2>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '2px solid var(--bd)',
        paddingBottom: 0,
      }}>
        {TABS.map((tab) => {
          const active = currentTab === tab.path;
          return (
            <Link
              key={tab.path}
              to={`/classroom/${classroomId}/${tab.path}`}
              style={{
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                color: active ? 'var(--ac)' : 'var(--ink2)',
                borderBottom: active ? '3px solid var(--ac)' : '3px solid transparent',
                marginBottom: -2,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
