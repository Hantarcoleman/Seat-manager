import { useState, useMemo } from 'react';
import { useStudentsStore } from '../../store/studentsStore';
import type { Student, StudentTag } from '../../types';
import { TAG_DEFS, tagLabel, getConflictingTag } from '../../types';
import StudentForm from './StudentForm';
import CsvImport from './CsvImport';

const ALL_TAGS = Object.keys(TAG_DEFS) as StudentTag[];

function isCharacterized(s: Student): boolean {
  return s.configured === true;
}

interface Props { classroomId: string; initialMode?: 'list' | 'add'; }

export default function StudentManager({ classroomId, initialMode }: Props) {
  const studentsByClassroom = useStudentsStore((s) => s.byClassroom);
  const addStudent = useStudentsStore((s) => s.add);
  const updateStudent = useStudentsStore((s) => s.update);
  const removeStudent = useStudentsStore((s) => s.remove);
  const importMany = useStudentsStore((s) => s.importMany);

  const students = studentsByClassroom[classroomId] ?? [];

  const [mode, setMode] = useState<'list' | 'add' | 'edit' | 'import'>(initialMode ?? 'list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<StudentTag | ''>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'characterized' | 'pending'>('all');
  const [tagMode, setTagMode] = useState<StudentTag | null>(null); // מצב סימון לפי מאפיין
  const [tagSearch, setTagSearch] = useState(''); // חיפוש שם במצב מאפיין

  const characterizedCount = useMemo(() => students.filter(isCharacterized).length, [students]);

  const tagCounts = useMemo(() => {
    const m = new Map<StudentTag, number>();
    for (const t of ALL_TAGS) {
      m.set(t, students.filter((s) => s.tags.includes(t)).length);
    }
    return m;
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (search && !s.name.includes(search)) return false;
      if (filterTag && !s.tags.includes(filterTag)) return false;
      if (filterStatus === 'characterized' && !isCharacterized(s)) return false;
      if (filterStatus === 'pending' && isCharacterized(s)) return false;
      return true;
    });
  }, [students, search, filterTag, filterStatus]);

  const editing = editingId ? students.find((s) => s.id === editingId) : null;

  // הוספת/הסרת מאפיין לתלמיד — שמירה מיידית, עם בדיקת סתירה
  const toggleTagForStudent = (studentId: string, tag: StudentTag) => {
    const stu = students.find((s) => s.id === studentId);
    if (!stu) return;
    if (stu.tags.includes(tag)) {
      updateStudent(classroomId, studentId, { tags: stu.tags.filter((t) => t !== tag), configured: true });
      return;
    }
    const conflict = getConflictingTag(tag);
    if (conflict && stu.tags.includes(conflict)) {
      const ok = confirm(
        `המאפיין "${TAG_DEFS[tag].emoji} ${TAG_DEFS[tag].neutral}" סותר את "${TAG_DEFS[conflict].emoji} ${TAG_DEFS[conflict].neutral}".\nלא ניתן לסמן את שניהם — להחליף?`
      );
      if (!ok) return;
      updateStudent(classroomId, studentId, { tags: [...stu.tags.filter((t) => t !== conflict), tag], configured: true });
      return;
    }
    updateStudent(classroomId, studentId, { tags: [...stu.tags, tag], configured: true });
  };

  // הסרת מאפיין סותר — מחזיר את התלמיד לרשימה הראשית
  const removeConflictTag = (studentId: string, conflictTag: StudentTag) => {
    const stu = students.find((s) => s.id === studentId);
    if (!stu) return;
    updateStudent(classroomId, studentId, { tags: stu.tags.filter((t) => t !== conflictTag), configured: true });
  };

  const onSaveNew = (data: Omit<Student, 'id'>) => { addStudent(classroomId, data); setMode('list'); };
  const onSaveEdit = (data: Omit<Student, 'id'>) => {
    if (editingId) updateStudent(classroomId, editingId, data);
    setMode('list'); setEditingId(null);
  };
  const onImport = (rows: Omit<Student, 'id'>[]) => {
    if (students.length > 0 && !confirm(`קיימים ${students.length} תלמידים בכיתה — לדרוס?`)) return;
    importMany(classroomId, rows); setMode('list');
  };

  if (mode === 'add') {
    return <StudentForm allStudents={students} onSave={onSaveNew} onCancel={() => setMode('list')} />;
  }
  if (mode === 'edit' && editing) {
    return (
      <StudentForm
        initial={editing} allStudents={students}
        onSave={onSaveEdit}
        onCancel={() => { setMode('list'); setEditingId(null); }}
        onDelete={() => { removeStudent(classroomId, editingId!); setMode('list'); setEditingId(null); }}
      />
    );
  }
  if (mode === 'import') {
    return <CsvImport onImport={onImport} onCancel={() => setMode('list')} />;
  }

  const activeTagDef = tagMode ? TAG_DEFS[tagMode] : null;
  const activeTagCount = tagMode ? (tagCounts.get(tagMode) ?? 0) : 0;

  // ── מצב סימון לפי מאפיין ──
  if (tagMode) {
    // needs_front: מטפלים בשתי קבוצות נפרדות במקום קבוצת סותר אחת
    const isNeedsFrontMode = tagMode === 'needs_front';

    // תלמידים עם needs_very_front — כבר בעדיפות גבוהה יותר, לא מציגים ברשימה הראשית
    const veryFrontStudents = isNeedsFrontMode
      ? students.filter((s) => s.tags.includes('needs_very_front'))
      : [];
    // תלמידים עם can_focus_back — גמישים, מוצגים בנפרד
    const canFocusBackStudents = isNeedsFrontMode
      ? students.filter((s) => s.tags.includes('can_focus_back') && !s.tags.includes('needs_very_front'))
      : [];

    const conflictTag = isNeedsFrontMode ? null : getConflictingTag(tagMode);
    // תלמידים עם מאפיין סותר — מוצגים בנפרד (לא ב-needs_front שמטופל בנפרד)
    const conflictStudents = conflictTag
      ? students.filter((s) => s.tags.includes(conflictTag))
      : [];

    // רשימה ראשית:
    // - needs_front: ללא needs_very_front וללא can_focus_back
    // - שאר המאפיינים: ללא בעלי המאפיין הסותר
    const mainStudents = isNeedsFrontMode
      ? students.filter((s) => !s.tags.includes('needs_very_front') && !s.tags.includes('can_focus_back'))
      : students.filter((s) => !conflictTag || !s.tags.includes(conflictTag));

    // מיין: עם המאפיין הנוכחי קודם, ואז סנן לפי חיפוש שם
    const sorted = [
      ...mainStudents.filter((s) => s.tags.includes(tagMode)),
      ...mainStudents.filter((s) => !s.tags.includes(tagMode)),
    ].filter((s) => !tagSearch.trim() || s.name.includes(tagSearch.trim()));

    const filteredConflict = conflictStudents
      .filter((s) => !tagSearch.trim() || s.name.includes(tagSearch.trim()));
    const filteredVeryFront = veryFrontStudents
      .filter((s) => !tagSearch.trim() || s.name.includes(tagSearch.trim()));
    const filteredCanFocusBack = canFocusBackStudents
      .filter((s) => !tagSearch.trim() || s.name.includes(tagSearch.trim()));

    return (
      <div>
        {/* כותרת מצב מאפיין */}
        <div style={{
          background: '#fff7ed', border: '2px solid var(--ac)', borderRadius: 'var(--r)',
          padding: '12px 16px', marginBottom: 14,
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        }}>
          <span style={{ fontSize: 22 }}>{activeTagDef?.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 900, fontSize: 15 }}>{activeTagDef?.neutral}</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
              לחץ על תלמיד לסימון / ביטול סימון · שומר מיד
            </div>
          </div>
          <span style={{
            background: activeTagCount > 0 ? 'var(--ac)' : 'var(--bd)',
            color: activeTagCount > 0 ? '#fff' : 'var(--ink3)',
            fontWeight: 800, fontSize: 14, borderRadius: 12, padding: '3px 12px',
          }}>
            {activeTagCount} תלמידים
          </span>
          <input
            type="text"
            value={tagSearch}
            onChange={(e) => setTagSearch(e.target.value)}
            placeholder="🔍 חיפוש שם..."
            autoFocus
            style={{
              padding: '7px 12px', fontSize: 13, width: 160,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', direction: 'rtl',
            }}
          />
          <button
            onClick={() => { setTagMode(null); setTagSearch(''); }}
            style={{
              background: 'var(--bg2)', border: '1.5px solid var(--bd)',
              borderRadius: 'var(--rs)', padding: '7px 16px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ✕ סיום
          </button>
        </div>

        {/* רשימת תלמידים — לחיצה = טוגל מאפיין */}
        {students.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--ink3)', padding: 32 }}>אין תלמידים</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {sorted.map((s) => {
              const hasTag = s.tags.includes(tagMode);
              const genderBg = s.gender === 'm' ? '#eff6ff' : s.gender === 'f' ? '#fdf2f8' : 'var(--bg2)';
              const nameColor = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
              return (
                <button
                  key={s.id}
                  onClick={() => toggleTagForStudent(s.id, tagMode)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: hasTag ? '#dcfce7' : genderBg,
                    border: `2px solid ${hasTag ? '#16a34a' : (s.gender === 'm' ? '#bfdbfe' : s.gender === 'f' ? '#fbcfe8' : 'var(--bd)')}`,
                    borderRadius: 'var(--r)', padding: '10px 14px',
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* אינדיקטור */}
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: hasTag ? '#16a34a' : 'var(--bg2)',
                    border: `2px solid ${hasTag ? '#16a34a' : 'var(--bd2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, color: '#fff', fontWeight: 800,
                  }}>
                    {hasTag ? '✓' : ''}
                  </span>
                  <div style={{ flex: 1, textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: hasTag ? '#166534' : nameColor }}>
                      {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                    </div>
                    {s.tags.length > 0 && s.tags.filter((t) => t !== tagMode).length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--ink3)', marginTop: 2 }}>
                        {s.tags.filter((t) => t !== tagMode).map((t) => TAG_DEFS[t]?.emoji).join(' ')}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* needs_front: תלמידים שכבר בשורה הקדמית ביותר (needs_very_front) */}
        {filteredVeryFront.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              background: '#fdf2f8', border: '1.5px solid #fbcfe8', borderRadius: 'var(--rs)',
              padding: '8px 14px', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🔴</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#be185d' }}>
                  {filteredVeryFront.length} תלמידים — כבר מסווגים לשורה הקדמית ביותר
                </span>
                <div style={{ fontSize: 11, color: '#9d174d', marginTop: 2 }}>
                  אינם צריכים גם סיווג "שתי שורות קדמיות" — עדיפות השורה הראשונה כבר מובטחת
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, opacity: 0.65 }}>
              {filteredVeryFront.map((s) => {
                const nameColor = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
                return (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: '#fdf2f8', border: '2px solid #fbcfe8',
                    borderRadius: 'var(--r)', padding: '10px 14px',
                  }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: '#f9a8d4', border: '2px solid #fbcfe8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#be185d', fontWeight: 800,
                    }}>🔴</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: nameColor }}>
                        {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#9d174d', marginTop: 1 }}>שורה קדמית ביותר</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* needs_front: תלמידים עם can_focus_back — יכולים לשבת מאחור */}
        {filteredCanFocusBack.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 'var(--rs)',
              padding: '8px 14px', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>🔚</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#166534' }}>
                  {filteredCanFocusBack.length} תלמידים — יכולים לשבת מאחור
                </span>
                <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>
                  לחץ על תלמיד כדי להחליף ל"חייב אחת משתי שורות קדמיות" במקום "יכול מאחור"
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {filteredCanFocusBack.map((s) => {
                const nameColor = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
                return (
                  <button
                    key={s.id}
                    onClick={() => removeConflictTag(s.id, 'can_focus_back')}
                    title='בטל "יכול מאחור" ולחץ לסמן "חייב שתי שורות קדמיות"'
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#f0fdf4', border: '2px solid #bbf7d0',
                      borderRadius: 'var(--r)', padding: '10px 14px',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: '#86efac', border: '2px solid #4ade80',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#166534', fontWeight: 800,
                    }}>🔚</span>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: nameColor }}>
                        {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#166534', marginTop: 1 }}>יכול/ה להתרכז מאחור</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* תלמידים עם מאפיין סותר */}
        {filteredConflict.length > 0 && conflictTag && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              background: '#fef3c7', border: '1.5px solid #fde68a', borderRadius: 'var(--rs)',
              padding: '8px 14px', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: '#92400e' }}>
                  {filteredConflict.length} תלמידים עם מאפיין סותר —{' '}
                  {TAG_DEFS[conflictTag].emoji} {TAG_DEFS[conflictTag].neutral}
                </span>
                <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>
                  לחץ על תלמיד לבטל את המאפיין הסותר ולהחזיר/ו לרשימה
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {filteredConflict.map((s) => {
                const nameColor = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
                return (
                  <button
                    key={s.id}
                    onClick={() => removeConflictTag(s.id, conflictTag)}
                    title={`בטל "${TAG_DEFS[conflictTag].neutral}" כדי להוסיף/ה לרשימה`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: '#fefce8', border: '2px solid #fde047',
                      borderRadius: 'var(--r)', padding: '10px 14px',
                      cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                    }}
                  >
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: '#fde047', border: '2px solid #ca8a04',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#713f12', fontWeight: 800,
                    }}>✕</span>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: nameColor }}>
                        {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                      </div>
                      <div style={{ fontSize: 10, color: '#a16207', marginTop: 1 }}>
                        {TAG_DEFS[conflictTag].emoji} {TAG_DEFS[conflictTag].neutral}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* בחירת מאפיין אחר בלי לצאת */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 8 }}>מעבר מהיר למאפיין אחר:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_TAGS.map((t) => {
              const def = TAG_DEFS[t];
              const cnt = tagCounts.get(t) ?? 0;
              const isActive = tagMode === t;
              return (
                <button
                  key={t}
                  onClick={() => { setTagMode(t); setTagSearch(''); }}
                  style={{
                    background: isActive ? 'var(--ac)' : 'var(--bg2)',
                    color: isActive ? '#fff' : 'var(--ink)',
                    border: `1.5px solid ${isActive ? 'var(--ac)' : 'var(--bd)'}`,
                    borderRadius: 20, padding: '5px 12px',
                    fontSize: 12, fontWeight: isActive ? 800 : 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {def.emoji} {def.neutral}
                  {cnt > 0 && (
                    <span style={{
                      marginRight: 5, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bd)',
                      borderRadius: 8, padding: '1px 6px', fontSize: 10,
                    }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── תצוגת רשימה רגילה ──
  return (
    <div>
      {/* Header + actions */}
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
        padding: 14, marginBottom: 12, boxShadow: 'var(--sh)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <button
          onClick={() => setMode('add')}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '8px 16px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
          }}
        >
          ➕ הוסף תלמיד
        </button>
        <button
          onClick={() => setMode('import')}
          style={{
            background: 'var(--bg2)', color: 'var(--ink)',
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
          }}
        >
          📥 ייבוא מקובץ
        </button>
        <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--ink2)' }}>
          <strong>{students.length}</strong> תלמידים ·{' '}
          <span style={{ color: 'var(--gn)', fontWeight: 700 }}>✓ {characterizedCount} אופיינו</span>
          {students.length > characterizedCount && (
            <span style={{ color: '#ca8a04', fontWeight: 700 }}>
              {' '}· ⏳ {students.length - characterizedCount} לאפיון
            </span>
          )}
        </span>
      </div>

      {/* פאנל מאפיינים — לחיצה פותחת מצב סימון */}
      {students.length > 0 && (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          padding: '10px 14px', marginBottom: 12, boxShadow: 'var(--sh)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 8 }}>
            🏷 סמן תלמידים לפי מאפיין — לחץ על מאפיין לסימון קבוצתי:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ALL_TAGS.map((t) => {
              const def = TAG_DEFS[t];
              const cnt = tagCounts.get(t) ?? 0;
              return (
                <button
                  key={t}
                  onClick={() => setTagMode(t)}
                  title={`לחץ לסימון/ביטול קבוצתי`}
                  style={{
                    background: cnt > 0 ? 'var(--abg)' : 'var(--bg)',
                    color: cnt > 0 ? '#9a3412' : 'var(--ink3)',
                    border: `1.5px solid ${cnt > 0 ? 'var(--abd)' : 'var(--bd)'}`,
                    borderRadius: 20, padding: '5px 12px',
                    fontSize: 12, fontWeight: cnt > 0 ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {def.emoji} {def.neutral}
                  {cnt > 0 && (
                    <span style={{
                      background: '#ea580c', color: '#fff',
                      borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 800,
                    }}>{cnt}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      {students.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 חיפוש שם..."
            style={{
              padding: '8px 12px', fontSize: 14, minWidth: 200,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', direction: 'rtl', flex: 1, maxWidth: 320,
            }}
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'characterized' | 'pending')}
            style={{
              padding: '8px 12px', fontSize: 14,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', background: 'var(--sf)',
            }}
          >
            <option value="all">כולם</option>
            <option value="characterized">✓ אופיינו</option>
            <option value="pending">⏳ ממתינים לאפיון</option>
          </select>
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value as StudentTag | '')}
            style={{
              padding: '8px 12px', fontSize: 14,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', background: 'var(--sf)',
            }}
          >
            <option value="">כל הסיווגים</option>
            {ALL_TAGS.map((t) => {
              const def = TAG_DEFS[t];
              return <option key={t} value={t}>{def.emoji} {def.neutral}</option>;
            })}
          </select>
        </div>
      )}

      {/* Empty state */}
      {students.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--bd2)', borderRadius: 'var(--r)',
          padding: 48, textAlign: 'center', color: 'var(--ink3)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
          <p style={{ margin: 0, fontSize: 16 }}>אין עדיין תלמידים. הוסף ידנית או ייבא מקובץ CSV/Excel.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px dashed var(--bd2)', borderRadius: 'var(--r)',
          padding: 32, textAlign: 'center', color: 'var(--ink3)',
        }}>
          <p style={{ margin: 0 }}>אין תלמידים מתאימים לחיפוש.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {filtered.map((s) => {
            const scoreColor = s.responsibilityScore >= 85 ? '#16a34a'
                             : s.responsibilityScore >= 70 ? '#ca8a04'
                             : s.responsibilityScore >= 40 ? '#0284c7'
                             : '#dc2626';
            const cardBg = s.gender === 'm' ? '#eff6ff' : s.gender === 'f' ? '#fdf2f8' : 'var(--bg2)';
            const cardBorder = s.gender === 'm' ? '#bfdbfe' : s.gender === 'f' ? '#fbcfe8' : 'var(--bd)';
            const nameColor = s.gender === 'm' ? '#1d4ed8' : s.gender === 'f' ? '#be185d' : 'var(--ink)';
            const characterized = isCharacterized(s);
            return (
              <div
                key={s.id}
                onClick={() => { setEditingId(s.id); setMode('edit'); }}
                style={{
                  background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 'var(--r)',
                  padding: 12, boxShadow: 'var(--sh)', display: 'flex', flexDirection: 'column', gap: 6,
                  position: 'relative', cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(0,0,0,.12)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh)'; }}
              >
                <div style={{
                  position: 'absolute', top: 8, left: 8,
                  background: characterized ? '#dcfce7' : '#fef3c7',
                  color: characterized ? '#166534' : '#92400e',
                  border: `1px solid ${characterized ? '#86efac' : '#fde68a'}`,
                  fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 8,
                }}>
                  {characterized ? '✓ אופיין' : '⏳ לאפיון'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, flex: 1, color: nameColor }}>
                    {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
                  </div>
                  <div style={{
                    background: scoreColor, color: '#fff', fontWeight: 800, fontSize: 12,
                    padding: '2px 8px', borderRadius: 10,
                  }} title="מדד אחריות">
                    {s.responsibilityScore}
                  </div>
                </div>
                {/* תגיות — לחיצה פותחת מצב סימון לאותה תגית */}
                {s.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {s.tags.map((t) => {
                      const def = TAG_DEFS[t as StudentTag];
                      if (!def) return null;
                      return (
                        <span
                          key={t}
                          onClick={(e) => { e.stopPropagation(); setTagMode(t as StudentTag); }}
                          title="לחץ לסימון קבוצתי"
                          style={{
                            fontSize: 10, fontWeight: 600, padding: '2px 6px',
                            background: 'var(--abg)', color: '#9a3412',
                            border: '1px solid var(--abd)', borderRadius: 4,
                            cursor: 'pointer',
                          }}
                        >
                          {tagLabel(t as StudentTag, s.gender)}
                        </span>
                      );
                    })}
                  </div>
                )}
                {(s.preferredNear.length > 0 || s.avoidNear.length > 0) && (
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                    {s.preferredNear.length > 0 && <span>✓ {s.preferredNear.length} </span>}
                    {s.avoidNear.length > 0 && <span>⚠ {s.avoidNear.length}</span>}
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 2 }}>לחץ לעריכה ואפיון ✏</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
