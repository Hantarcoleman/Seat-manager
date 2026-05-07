import { useState, useEffect, useRef } from 'react';
import type { Student, StudentTag } from '../../types';
import { TAG_DEFS, tagLabel, migrateStudentTags } from '../../types';

const ALL_TAGS = Object.keys(TAG_DEFS) as StudentTag[];

interface Props {
  initial?: Partial<Student>;
  allStudents: Student[];
  onSave: (data: Omit<Student, 'id'>) => void;
  onCancel: () => void;
}

// ── Autocomplete לבחירת תלמידים ────────────────────────────
function StudentAutocomplete({ value, onChange, label, color, students, currentId }: {
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
  color: string;
  students: Student[];
  currentId?: string;
}) {
  const [text, setText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const others = students.filter((s) => s.id !== currentId && !value.includes(s.id));
  const matches = text.trim()
    ? others.filter((s) => s.name.includes(text.trim()))
    : others;
  const visible = matches.slice(0, 8);

  // לסגור dropdown בלחיצה מחוץ
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const add = (id: string) => {
    onChange([...value, id]);
    setText('');
    setHighlightIdx(0);
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    onChange(value.filter((x) => x !== id));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(visible.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[highlightIdx]) add(visible[highlightIdx].id);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      // מחיקת הצ'יפ האחרון
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div ref={containerRef} style={{ marginBottom: 12, position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color }}>
        {label}
      </label>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4,
        border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
        padding: '6px 8px', background: 'var(--sf)', alignItems: 'center',
        minHeight: 38,
      }}>
        {/* צ'יפים של נבחרים */}
        {value.map((id) => {
          const s = students.find((x) => x.id === id);
          if (!s) return null;
          return (
            <span key={id} style={{
              background: color, color: '#fff', fontSize: 12, fontWeight: 700,
              padding: '3px 6px 3px 8px', borderRadius: 'var(--rs)',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {s.name}
              <button
                type="button"
                onClick={() => remove(id)}
                style={{
                  background: 'transparent', border: 'none', color: '#fff',
                  fontSize: 14, fontWeight: 800, cursor: 'pointer', padding: 0,
                  lineHeight: 1, marginRight: 2,
                }}
                title="הסר"
              >×</button>
            </span>
          );
        })}
        {/* שדה הקלט */}
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => { setText(e.target.value); setShowDropdown(true); setHighlightIdx(0); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? 'הקלד שם תלמיד...' : ''}
          style={{
            flex: 1, minWidth: 120, border: 'none', outline: 'none',
            background: 'transparent', fontSize: 14, fontFamily: 'inherit',
            direction: 'rtl', padding: '4px 4px',
          }}
        />
      </div>

      {/* רשימת השלמה */}
      {showDropdown && visible.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 2,
          background: 'var(--bg2)', border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
          boxShadow: 'var(--shl)', zIndex: 30, maxHeight: 280, overflow: 'auto',
        }}>
          {visible.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); add(s.id); }}
              onMouseEnter={() => setHighlightIdx(i)}
              style={{
                display: 'block', width: '100%', textAlign: 'right',
                padding: '8px 12px', fontSize: 14, fontFamily: 'inherit',
                background: i === highlightIdx ? 'var(--abg)' : 'transparent',
                color: 'var(--ink)', border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--bd)',
              }}
            >
              {s.gender === 'f' ? '👧 ' : s.gender === 'm' ? '👦 ' : ''}{s.name}
            </button>
          ))}
        </div>
      )}

      {showDropdown && text.trim() && visible.length === 0 && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, left: 0, marginTop: 2,
          background: 'var(--bg2)', border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
          padding: '8px 12px', fontSize: 13, color: 'var(--ink3)', zIndex: 30,
        }}>
          לא נמצאו תלמידים בשם "{text}"
        </div>
      )}
    </div>
  );
}

export default function StudentForm({ initial, allStudents, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<'m' | 'f' | ''>(initial?.gender ?? '');
  const [tags, setTags] = useState<StudentTag[]>(initial?.tags ?? []);
  const [responsibilityScore, setResponsibilityScore] = useState(initial?.responsibilityScore ?? 70);
  const [preferredNear, setPreferredNear] = useState<string[]>(initial?.preferredNear ?? []);
  const [avoidNear, setAvoidNear] = useState<string[]>(initial?.avoidNear ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setGender(initial.gender ?? '');
      // המרת תיוגים ישנים לתיוגים החדשים
      setTags(migrateStudentTags(initial.tags ?? []));
      setResponsibilityScore(initial.responsibilityScore ?? 70);
      setPreferredNear(initial.preferredNear ?? []);
      setAvoidNear(initial.avoidNear ?? []);
      setNotes(initial.notes ?? '');
    }
  }, [initial]);

  const toggleTag = (t: StudentTag) => {
    setTags((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      gender: gender === '' ? undefined : gender,
      tags,
      responsibilityScore,
      preferredNear,
      avoidNear,
      notes: notes.trim() || undefined,
      configured: true,
    });
  };

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
      padding: 20, boxShadow: 'var(--sh)',
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 16px' }}>
        {initial?.id ? 'ערוך תלמיד' : 'הוסף תלמיד'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>שם מלא *</label>
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            autoFocus placeholder="שם התלמיד"
            style={{
              width: '100%', padding: '8px 12px', fontSize: 14,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>מין</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as 'm' | 'f' | '')}
            style={{
              width: '100%', padding: '8px 12px', fontSize: 14,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', background: 'var(--sf)', boxSizing: 'border-box',
            }}
          >
            <option value="">—</option>
            <option value="m">בן</option>
            <option value="f">בת</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>צרכים ותכונות</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ALL_TAGS.map((t) => {
            const on = tags.includes(t);
            // התווית משתנה לפי המין שנבחר בטופס
            const label = tagLabel(t, gender === '' ? undefined : gender);
            return (
              <button
                key={t} type="button" onClick={() => toggleTag(t)}
                style={{
                  background: on ? 'var(--ac)' : 'var(--bg2)',
                  color: on ? '#fff' : 'var(--ink2)',
                  border: `1px solid ${on ? 'var(--ac)' : 'var(--bd2)'}`,
                  borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          מדד אחריות: <span style={{ color: 'var(--ac)' }}>{responsibilityScore}</span>
          <span style={{ color: 'var(--ink3)', fontWeight: 400, marginRight: 8 }}>
            ({responsibilityScore < 40 ? 'דורש ליווי' : responsibilityScore < 70 ? 'רגיל' : responsibilityScore < 85 ? 'אחראי' : 'עצמאי מאוד'})
          </span>
        </label>
        <input
          type="range" min={0} max={100} value={responsibilityScore}
          onChange={(e) => setResponsibilityScore(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <StudentAutocomplete
        label="✓ עובד טוב ליד"
        color="#16a34a"
        value={preferredNear}
        onChange={setPreferredNear}
        students={allStudents}
        currentId={initial?.id}
      />
      <StudentAutocomplete
        label="⚠ לא מומלץ ליד / חייב הפרדה"
        color="#dc2626"
        value={avoidNear}
        onChange={setAvoidNear}
        students={allStudents}
        currentId={initial?.id}
      />

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>הערות (פרטי, רק למורה)</label>
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)}
          rows={2} placeholder="הערות פנימיות..."
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            fontFamily: 'inherit', direction: 'rtl', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{
            background: 'transparent', color: 'var(--ink2)',
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            padding: '8px 18px', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          ביטול
        </button>
        <button onClick={submit} disabled={!name.trim()}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '8px 22px', fontWeight: 800, fontSize: 14,
            cursor: name.trim() ? 'pointer' : 'not-allowed',
            opacity: name.trim() ? 1 : 0.5, fontFamily: 'inherit',
          }}>
          שמור
        </button>
      </div>
    </div>
  );
}
