import { useState, useEffect } from 'react';
import type { Student, StudentTag } from '../../types';

const TAG_LABELS: Record<StudentTag, string> = {
  vision_needs_front:  '👓 צריך לשבת קדימה (ראייה)',
  adhd_needs_front:    '🎯 צריך לשבת קדימה (קשב)',
  tall:                '📏 גבוה',
  quiet:               '🤫 שקט',
  talkative:           '💬 דברן',
  distractible:        '🌀 נוטה להסחה',
  independent:         '⭐ עצמאי',
  needs_support:       '🤝 זקוק לתמיכה',
  positive_influence:  '✨ השפעה חיובית',
};

interface Props {
  initial?: Partial<Student>;
  allStudents: Student[];     // לבחירה ב-preferredNear/avoidNear/mustSeparate
  onSave: (data: Omit<Student, 'id'>) => void;
  onCancel: () => void;
}

export default function StudentForm({ initial, allStudents, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<'m' | 'f' | ''>(initial?.gender ?? '');
  const [tags, setTags] = useState<StudentTag[]>(initial?.tags ?? []);
  const [responsibilityScore, setResponsibilityScore] = useState(initial?.responsibilityScore ?? 70);
  const [preferredNear, setPreferredNear] = useState<string[]>(initial?.preferredNear ?? []);
  const [avoidNear, setAvoidNear] = useState<string[]>(initial?.avoidNear ?? []);
  const [mustSeparate, setMustSeparate] = useState<string[]>(initial?.mustSeparate ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? '');

  useEffect(() => {
    if (initial) {
      setName(initial.name ?? '');
      setGender(initial.gender ?? '');
      setTags(initial.tags ?? []);
      setResponsibilityScore(initial.responsibilityScore ?? 70);
      setPreferredNear(initial.preferredNear ?? []);
      setAvoidNear(initial.avoidNear ?? []);
      setMustSeparate(initial.mustSeparate ?? []);
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
      mustSeparate,
      notes: notes.trim() || undefined,
    });
  };

  // multi-select של תלמידים אחרים
  const StudentMultiSelect = ({ value, onChange, label, color }: {
    value: string[]; onChange: (v: string[]) => void; label: string; color: string;
  }) => {
    const others = allStudents.filter((s) => s.id !== initial?.id);
    return (
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4, color }}>
          {label}
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {others.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--ink3)' }}>אין תלמידים אחרים ברשימה</span>
          ) : others.map((s) => {
            const on = value.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(on ? value.filter((x) => x !== s.id) : [...value, s.id])}
                style={{
                  background: on ? color : 'var(--bg2)',
                  color: on ? '#fff' : 'var(--ink2)',
                  border: `1px solid ${on ? color : 'var(--bd2)'}`,
                  borderRadius: 'var(--rs)', padding: '4px 10px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      </div>
    );
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
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="שם התלמיד"
            style={{
              width: '100%', padding: '8px 12px', fontSize: 14,
              border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
              fontFamily: 'inherit', direction: 'rtl', boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>מגדר</label>
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

      {/* Tags */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>צרכים ותכונות</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(Object.keys(TAG_LABELS) as StudentTag[]).map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                style={{
                  background: on ? 'var(--ac)' : 'var(--bg2)',
                  color: on ? '#fff' : 'var(--ink2)',
                  border: `1px solid ${on ? 'var(--ac)' : 'var(--bd2)'}`,
                  borderRadius: 'var(--rs)', padding: '6px 10px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {TAG_LABELS[t]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Responsibility score */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
          מדד אחריות: <span style={{ color: 'var(--ac)' }}>{responsibilityScore}</span>
          <span style={{ color: 'var(--ink3)', fontWeight: 400, marginRight: 8 }}>
            ({responsibilityScore < 40 ? 'דורש ליווי' : responsibilityScore < 70 ? 'רגיל' : responsibilityScore < 85 ? 'אחראי' : 'עצמאי מאוד'})
          </span>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={responsibilityScore}
          onChange={(e) => setResponsibilityScore(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      {/* Social constraints */}
      <StudentMultiSelect
        label="✓ עובד טוב ליד"
        color="#16a34a"
        value={preferredNear}
        onChange={setPreferredNear}
      />
      <StudentMultiSelect
        label="⚠ לא מומלץ ליד"
        color="#f59e0b"
        value={avoidNear}
        onChange={setAvoidNear}
      />
      <StudentMultiSelect
        label="🚫 חייב הפרדה"
        color="#dc2626"
        value={mustSeparate}
        onChange={setMustSeparate}
      />

      {/* Notes */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>הערות (פרטי, רק למורה)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="הערות פנימיות..."
          style={{
            width: '100%', padding: '8px 12px', fontSize: 13,
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            fontFamily: 'inherit', direction: 'rtl', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            background: 'transparent', color: 'var(--ink2)',
            border: '1.5px solid var(--bd2)', borderRadius: 'var(--rs)',
            padding: '8px 18px', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          ביטול
        </button>
        <button
          onClick={submit}
          disabled={!name.trim()}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '8px 22px', fontWeight: 800, fontSize: 14,
            cursor: name.trim() ? 'pointer' : 'not-allowed',
            opacity: name.trim() ? 1 : 0.5, fontFamily: 'inherit',
          }}
        >
          שמור
        </button>
      </div>
    </div>
  );
}
