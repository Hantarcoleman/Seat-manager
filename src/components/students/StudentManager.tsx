import { useState, useMemo } from 'react';
import { useStudentsStore } from '../../store/studentsStore';
import type { Student, StudentTag } from '../../types';
import { TAG_DEFS, tagLabel } from '../../types';
import StudentForm from './StudentForm';
import CsvImport from './CsvImport';

const ALL_TAGS = Object.keys(TAG_DEFS) as StudentTag[];

// תלמיד "אופיין" אם המורה לחץ "שמור" בטופס שלו (configured=true)
function isCharacterized(s: Student): boolean {
  return s.configured === true;
}

interface Props {
  classroomId: string;
}

export default function StudentManager({ classroomId }: Props) {
  const studentsByClassroom = useStudentsStore((s) => s.byClassroom);
  const addStudent = useStudentsStore((s) => s.add);
  const updateStudent = useStudentsStore((s) => s.update);
  const removeStudent = useStudentsStore((s) => s.remove);
  const importMany = useStudentsStore((s) => s.importMany);

  const students = studentsByClassroom[classroomId] ?? [];

  const [mode, setMode] = useState<'list' | 'add' | 'edit' | 'import'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState<StudentTag | ''>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'characterized' | 'pending'>('all');

  const characterizedCount = useMemo(() =>
    students.filter(isCharacterized).length, [students]);

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

  const onSaveNew = (data: Omit<Student, 'id'>) => {
    addStudent(classroomId, data);
    setMode('list');
  };

  const onSaveEdit = (data: Omit<Student, 'id'>) => {
    if (editingId) updateStudent(classroomId, editingId, data);
    setMode('list');
    setEditingId(null);
  };

  const onImport = (rows: Omit<Student, 'id'>[]) => {
    if (students.length > 0) {
      if (!confirm(`קיימים ${students.length} תלמידים בכיתה — לדרוס?`)) return;
    }
    importMany(classroomId, rows);
    setMode('list');
  };

  if (mode === 'add') {
    return (
      <StudentForm
        allStudents={students}
        onSave={onSaveNew}
        onCancel={() => setMode('list')}
      />
    );
  }

  if (mode === 'edit' && editing) {
    return (
      <StudentForm
        initial={editing}
        allStudents={students}
        onSave={onSaveEdit}
        onCancel={() => { setMode('list'); setEditingId(null); }}
      />
    );
  }

  if (mode === 'import') {
    return <CsvImport onImport={onImport} onCancel={() => setMode('list')} />;
  }

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
            padding: '8px 16px', fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
          }}
        >
          📥 ייבוא מקובץ
        </button>
        <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--ink2)' }}>
          <strong>{students.length}</strong> תלמידים ·{' '}
          <span style={{ color: 'var(--gn)', fontWeight: 700 }}>
            ✓ {characterizedCount} אופיינו
          </span>
          {students.length > characterizedCount && (
            <span style={{ color: '#ca8a04', fontWeight: 700 }}>
              {' '}· ⏳ {students.length - characterizedCount} לאפיון
            </span>
          )}
        </span>
      </div>

      {/* Filters */}
      {students.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          marginBottom: 12,
        }}>
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
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8,
        }}>
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
                style={{
                  background: cardBg, border: `1.5px solid ${cardBorder}`, borderRadius: 'var(--r)',
                  padding: 12, boxShadow: 'var(--sh)', display: 'flex', flexDirection: 'column', gap: 6,
                  position: 'relative',
                }}
              >
                {/* תווית "אופיין" / "ממתין לאפיון" */}
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
                {s.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {s.tags.map((t) => {
                      const def = TAG_DEFS[t as StudentTag];
                      if (!def) return null;
                      return (
                        <span key={t} style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 6px',
                          background: 'var(--abg)', color: '#9a3412',
                          border: '1px solid var(--abd)', borderRadius: 4,
                        }}>
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
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => { setEditingId(s.id); setMode('edit'); }}
                    style={{
                      background: 'var(--bg2)', color: 'var(--ink)',
                      border: '1px solid var(--bd2)', borderRadius: 'var(--rs)',
                      padding: '4px 10px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    ✏ ערוך
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`למחוק את ${s.name}?`)) removeStudent(classroomId, s.id);
                    }}
                    style={{
                      background: 'var(--bg2)', color: 'var(--rd)',
                      border: '1px solid #fecaca', borderRadius: 'var(--rs)',
                      padding: '4px 10px', fontSize: 12, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
