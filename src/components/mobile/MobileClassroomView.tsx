import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClassroomStore } from '../../store/classroomStore';
import { useStudentsStore } from '../../store/studentsStore';
import RoomEditor from '../canvas/RoomEditor';
import DeskLayoutEditor from '../canvas/DeskLayoutEditor';
import StudentManager from '../students/StudentManager';
import SeatingEditor from '../canvas/SeatingEditor';

export type MobileTab = 'seating' | 'students' | 'desks' | 'room';

interface Props {
  classroomId: string;
  initialTab?: MobileTab;
}

const TABS: { id: MobileTab; emoji: string; label: string }[] = [
  { id: 'seating',  emoji: '📋', label: 'סידור' },
  { id: 'students', emoji: '👤', label: 'תלמידים' },
  { id: 'desks',    emoji: '🪑', label: 'שולחנות' },
  { id: 'room',     emoji: '🏛',  label: 'כיתה' },
];

export default function MobileClassroomView({ classroomId, initialTab = 'seating' }: Props) {
  const [activeTab, setActiveTab] = useState<MobileTab>(initialTab);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkGender, setBulkGender] = useState<'m' | 'f' | undefined>(undefined);
  const [bulkDone, setBulkDone] = useState(false);
  const navigate = useNavigate();

  const classroom = useClassroomStore((s) => s.classrooms[classroomId]);
  const addStudent = useStudentsStore((s) => s.add);
  const students   = useStudentsStore((s) => s.byClassroom[classroomId] ?? []);

  const handleBulkAdd = () => {
    const names = bulkText.split('\n').map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) return;
    names.forEach((name) => {
      addStudent(classroomId, {
        name,
        gender: bulkGender,
        tags: [],
        notes: '',
        responsibilityScore: 70,
        preferredNear: [],
        avoidNear: [],
        configured: false,
      });
    });
    setBulkText('');
    setBulkMode(false);
    setBulkDone(true);
    setTimeout(() => setBulkDone(false), 2500);
  };

  if (!classroom) return null;

  return (
    <>
      {/* כיסוי מסך מלא — bypasses App.tsx header + padding */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
        direction: 'rtl',
      }}>

        {/* כותרת */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', background: 'var(--bg2)',
          borderBottom: '1px solid var(--bd)', flexShrink: 0, minHeight: 44,
        }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--ac)', fontSize: 15, fontWeight: 700,
              fontFamily: 'inherit', padding: '4px 0', flexShrink: 0 }}
          >
            ← הכיתות
          </button>
          <span style={{ color: 'var(--ink3)', flexShrink: 0 }}>·</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink)',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {classroom.name}
          </span>
        </div>

        {/* תוכן */}
        <div style={{
          flex: 1, minHeight: 0, position: 'relative',
          overflow: activeTab === 'seating' ? 'hidden' : 'auto',
        }}>
          {activeTab === 'room' && <RoomEditor classroomId={classroomId} isMobile />}
          {activeTab === 'desks' && <DeskLayoutEditor classroomId={classroomId} isMobile />}

          {activeTab === 'students' && (
            <div style={{ padding: 12 }}>
              {/* כותרת + כפתורי הוספה */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => { setBulkMode(true); setBulkText(''); }}
                  style={{
                    flex: 1, minWidth: 140,
                    padding: '11px 14px', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                    background: 'var(--ac)', color: '#fff', border: 'none',
                    borderRadius: 'var(--rs)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  ➕ הוספת תלמידים
                </button>
                {bulkDone && (
                  <div style={{ flex: 1, padding: '11px 14px', background: '#f0fdf4', color: '#15803d',
                    border: '1.5px solid #bbf7d0', borderRadius: 'var(--rs)', fontWeight: 700, fontSize: 14,
                    textAlign: 'center' }}>
                    ✓ התלמידים נוספו!
                  </div>
                )}
              </div>

              {/* פאנל הוספה מהירה */}
              {bulkMode && (
                <div style={{
                  background: '#fff7ed', border: '1.5px solid #fed7aa',
                  borderRadius: 'var(--r)', padding: 14, marginBottom: 14,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#9a3412', marginBottom: 10 }}>
                    ➕ הוספת תלמידים — שם בכל שורה
                  </div>

                  {/* מין */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {([[undefined, '🙂 לא מוגדר'], ['m', '👦 בנים'], ['f', '👧 בנות']] as const).map(([val, label]) => (
                      <button key={val ?? 'none'} onClick={() => setBulkGender(val)}
                        style={{
                          flex: 1, padding: '8px 4px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                          background: bulkGender === val ? 'var(--ac)' : 'var(--bg2)',
                          color: bulkGender === val ? '#fff' : 'var(--ink)',
                          border: `1.5px solid ${bulkGender === val ? 'var(--ac)' : 'var(--bd2)'}`,
                          borderRadius: 'var(--rs)', cursor: 'pointer',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    autoFocus
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'ישראל ישראלי\nשרה כהן\nמשה לוי'}
                    rows={6}
                    style={{
                      width: '100%', padding: '10px 12px', fontSize: 15, fontFamily: 'inherit',
                      border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
                      direction: 'rtl', boxSizing: 'border-box', resize: 'vertical',
                      lineHeight: 1.7,
                    }}
                  />

                  <div style={{ fontSize: 12, color: 'var(--ink3)', margin: '6px 0 10px' }}>
                    {bulkText.split('\n').filter((l) => l.trim()).length} שמות
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setBulkMode(false)}
                      style={{ flex: 1, padding: '11px', fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                        background: 'var(--bg)', border: '1.5px solid var(--bd2)',
                        borderRadius: 'var(--rs)', cursor: 'pointer' }}>
                      ביטול
                    </button>
                    <button onClick={handleBulkAdd}
                      disabled={!bulkText.split('\n').some((l) => l.trim())}
                      style={{ flex: 2, padding: '11px', fontWeight: 800, fontSize: 14, fontFamily: 'inherit',
                        background: 'var(--ac)', color: '#fff', border: 'none',
                        borderRadius: 'var(--rs)', cursor: 'pointer' }}>
                      הוסף {bulkText.split('\n').filter((l) => l.trim()).length} תלמידים
                    </button>
                  </div>
                </div>
              )}

              {/* רשימת תלמידים */}
              {students.length > 0 ? (
                <StudentManager classroomId={classroomId} />
              ) : (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--ink3)' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>👥</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>עוד אין תלמידים בכיתה</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>לחץ "הוספת תלמידים" למעלה</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'seating' && <SeatingEditor classroomId={classroomId} isMobile />}
        </div>

        {/* Tab Bar */}
        <div style={{
          display: 'flex', borderTop: '1px solid var(--bd)',
          background: 'var(--bg2)', flexShrink: 0,
        }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setBulkMode(false); }}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  padding: '7px 2px 5px', background: 'none', border: 'none',
                  borderTop: active ? '2.5px solid var(--ac)' : '2.5px solid transparent',
                  cursor: 'pointer', fontFamily: 'inherit',
                  color: active ? 'var(--ac)' : 'var(--ink3)', gap: 2,
                }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.emoji}</span>
                <span style={{ fontSize: 10, fontWeight: active ? 800 : 600 }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* placeholder כדי שה-App layout לא יצור scroll */}
      <div style={{ height: '100vh' }} />
    </>
  );
}
