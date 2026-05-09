import { Link, useLocation } from 'react-router-dom';

interface Props {
  classroomId: string;
  classroomName: string;
}

const TABS = [
  { path: 'setup',   label: '🏗 כיתה ושולחנות' },
  { path: 'seating', label: '📋 ניהול תלמידים ומקומות ישיבה' },
];

export default function ClassroomNav({ classroomId, classroomName }: Props) {
  const location = useLocation();
  const currentTab = location.pathname.split('/').pop();

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Link to="/" style={{ color: 'var(--ac)', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
          ← הכיתות שלי
        </Link>
        <span style={{ color: 'var(--ink3)' }}>·</span>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{classroomName}</h2>
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
