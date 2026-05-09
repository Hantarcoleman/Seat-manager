import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClassroomStore } from '../../store/classroomStore';
import RoomEditor from '../canvas/RoomEditor';
import DeskLayoutEditor from '../canvas/DeskLayoutEditor';
import StudentManager from '../students/StudentManager';
import SeatingEditor from '../canvas/SeatingEditor';

export type MobileTab = 'room' | 'desks' | 'students' | 'seating';

interface Props {
  classroomId: string;
  initialTab?: MobileTab;
}

const TABS: { id: MobileTab; emoji: string; label: string }[] = [
  { id: 'room',     emoji: '🏛', label: 'כיתה' },
  { id: 'desks',    emoji: '🪑', label: 'שולחנות' },
  { id: 'students', emoji: '👤', label: 'תלמידים' },
  { id: 'seating',  emoji: '📋', label: 'סידור' },
];

export default function MobileClassroomView({ classroomId, initialTab = 'seating' }: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>(initialTab);
  const navigate = useNavigate();
  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);

  if (!classroom) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100dvh',
      overflow: 'hidden',
      background: 'var(--bg)',
    }}>
      {/* כותרת קומפקטית */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--bd)',
        flexShrink: 0,
        minHeight: 48,
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ac)', fontSize: 15, fontWeight: 700,
            fontFamily: 'inherit', padding: '4px 0', flexShrink: 0,
          }}
        >
          ← הכיתות
        </button>
        <span style={{ color: 'var(--ink3)', flexShrink: 0 }}>·</span>
        <span style={{
          fontSize: 16, fontWeight: 800, color: 'var(--ink)',
          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {classroom.name}
        </span>
      </div>

      {/* תוכן הלשונית הפעילה */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {activeTab === 'room' && (
          <RoomEditor classroomId={classroomId} isMobile />
        )}
        {activeTab === 'desks' && (
          <DeskLayoutEditor classroomId={classroomId} isMobile />
        )}
        {activeTab === 'students' && (
          <div style={{ padding: 12 }}>
            <StudentManager classroomId={classroomId} />
          </div>
        )}
        {activeTab === 'seating' && (
          <SeatingEditor classroomId={classroomId} isMobile />
        )}
      </div>

      {/* Tab Bar תחתון */}
      <div style={{
        display: 'flex',
        borderTop: '1px solid var(--bd)',
        background: 'var(--bg2)',
        flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 2px 6px',
                background: 'none',
                border: 'none',
                borderTop: active ? '2.5px solid var(--ac)' : '2.5px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: active ? 'var(--ac)' : 'var(--ink3)',
                gap: 2,
                transition: 'color 0.15s',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1 }}>{tab.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: active ? 800 : 600 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
