import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SharedClassroomData } from '../types';

// מקודד UTF-8 → bytes → base64 — קומפקטי ותומך בעברית
function utf8ToB64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function b64ToUtf8(raw: string): string {
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function decodeShareData(raw: string): SharedClassroomData | null {
  try {
    return JSON.parse(b64ToUtf8(raw)) as SharedClassroomData;
  } catch {
    return null;
  }
}

// מקודד בקשה כ-URL לשיתוף עם המורה
function encodeRequestUrl(
  classroomId: string,
  requesterName: string,
  preferredNear: string,
  message: string
): string {
  const payload = JSON.stringify({ classroomId, requesterName, preferredNear, message });
  const base = window.location.href.split('#')[0];
  return `${base}#/classroom/${classroomId}/requests?req=${utf8ToB64(payload)}`;
}

export default function StudentRequestPage() {
  const [params] = useSearchParams();
  const data = useMemo(() => {
    const raw = params.get('d');
    return raw ? decodeShareData(raw) : null;
  }, [params]);

  const [requesterName, setRequesterName] = useState('');
  const [preferredNear, setPreferredNear] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submissionUrl, setSubmissionUrl] = useState('');
  const [copied, setCopied] = useState(false);

  if (!data) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>קישור לא תקין</h2>
          <p style={{ color: 'var(--ink2)', margin: 0 }}>
            בקש מהמורה לשלוח לך קישור חדש.
          </p>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requesterName || !preferredNear) return;
    const url = encodeRequestUrl(data.classroomId, requesterName, preferredNear, message);
    setSubmissionUrl(url);
    setSubmitted(true);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(submissionUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`בקשת מעבר מקום ישיבה:\n${submissionUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  if (submitted) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>הבקשה מוכנה!</h2>
          <p style={{ color: 'var(--ink2)', margin: '0 0 20px', lineHeight: 1.5 }}>
            שלח/י את הקישור הזה למורה (ב-WhatsApp, במייל, או בכל דרך אחרת).<br />
            המורה יטפל/תטפל בבקשה ויחזור/תחזור אליך.
          </p>

          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--bd)',
            borderRadius: 'var(--rs)', padding: '10px 14px',
            fontSize: 12, color: 'var(--ink2)', wordBreak: 'break-all',
            marginBottom: 16, textAlign: 'left', direction: 'ltr',
          }}>
            {submissionUrl}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleCopy} style={btnStyle('#4CAF50')}>
              {copied ? '✔ הועתק!' : '📋 העתק קישור'}
            </button>
            <button onClick={handleWhatsApp} style={btnStyle('#25D366')}>
              📲 שלח ב-WhatsApp
            </button>
          </div>
        </div>
      </div>
    );
  }

  const otherStudents = data.students.filter((s) => s !== requesterName);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>📝</div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 900 }}>בקשת מעבר מקום ישיבה</h1>
          <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 14 }}>{data.name}</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label style={labelStyle}>
            <span style={labelTextStyle}>השם שלי *</span>
            <select
              value={requesterName}
              onChange={(e) => { setRequesterName(e.target.value); setPreferredNear(''); }}
              required
              style={selectStyle}
            >
              <option value="">— בחר/י את שמך —</option>
              {data.students.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>ליד מי אני רוצה לשבת *</span>
            <select
              value={preferredNear}
              onChange={(e) => setPreferredNear(e.target.value)}
              required
              disabled={!requesterName}
              style={{ ...selectStyle, opacity: requesterName ? 1 : 0.5 }}
            >
              <option value="">— בחר/י —</option>
              <option value="לא משנה ליד מי">לא משנה ליד מי</option>
              {otherStudents.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <span style={labelTextStyle}>הסבר / בקשה (לא חובה)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="כתוב/י כאן את הבקשה שלך..."
              rows={3}
              style={{
                ...selectStyle,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
            />
          </label>

          <button
            type="submit"
            disabled={!requesterName || !preferredNear}
            style={{
              ...btnStyle('var(--ac)'),
              opacity: requesterName && preferredNear ? 1 : 0.4,
              cursor: requesterName && preferredNear ? 'pointer' : 'default',
              fontSize: 16,
              padding: '14px 24px',
              marginTop: 4,
            }}
          >
            שלח/י בקשה
          </button>
        </form>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '32px 16px',
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--bd)',
  borderRadius: 'var(--r)',
  padding: '32px 28px',
  maxWidth: 480,
  width: '100%',
  boxShadow: 'var(--sh)',
  textAlign: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  textAlign: 'right',
};

const labelTextStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--ink)',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 15,
  border: '1px solid var(--bd)',
  borderRadius: 'var(--rs)',
  background: 'var(--bg)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  direction: 'rtl',
};

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--rs)',
    padding: '11px 20px',
    fontWeight: 700,
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'inherit',
  };
}
