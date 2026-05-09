import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useClassroomStore } from '../store/classroomStore';
import { useStudentsStore } from '../store/studentsStore';
import { useRequestsStore } from '../store/requestsStore';
import ClassroomNav from '../components/canvas/ClassroomNav';
import type { SeatRequest, SeatRequestStatus, SharedClassroomData } from '../types';

// מקודד את נתוני הכיתה לשיתוף עם תלמידים
function encodeShareData(data: SharedClassroomData): string {
  return btoa(JSON.stringify(data));
}

// מפענח בקשה שהגיעה ב-URL מתלמיד
function decodeIncomingRequest(raw: string): {
  classroomId: string;
  requesterName: string;
  preferredNear: string;
  message: string;
} | null {
  try {
    return JSON.parse(atob(raw));
  } catch {
    return null;
  }
}

function StatusBadge({ status }: { status: SeatRequestStatus }) {
  const map: Record<SeatRequestStatus, { label: string; bg: string; color: string }> = {
    pending:  { label: 'ממתין',  bg: '#fff3cd', color: '#856404' },
    approved: { label: 'אושר',   bg: '#d1e7dd', color: '#0a5c36' },
    denied:   { label: 'נדחה',   bg: '#f8d7da', color: '#842029' },
  };
  const s = map[status];
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
      fontSize: 12, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

interface RespondModalProps {
  req: SeatRequest;
  onClose: () => void;
  onRespond: (status: SeatRequestStatus, response: string) => void;
}

function RespondModal({ req, onClose, onRespond }: RespondModalProps) {
  const [status, setStatus] = useState<SeatRequestStatus>(req.status === 'pending' ? 'approved' : req.status);
  const [response, setResponse] = useState(req.response ?? '');

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg2)', borderRadius: 'var(--r)', padding: 28,
        maxWidth: 440, width: '100%', boxShadow: 'var(--sh)',
      }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>תגובה לבקשה</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--ink2)', fontSize: 13 }}>
          {req.requesterName} — ליד {req.preferredNear}
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {(['approved', 'denied'] as SeatRequestStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              style={{
                flex: 1,
                padding: '10px 0',
                border: status === s ? '2px solid var(--ac)' : '1px solid var(--bd)',
                borderRadius: 'var(--rs)',
                background: status === s
                  ? (s === 'approved' ? '#d1e7dd' : '#f8d7da')
                  : 'var(--bg)',
                color: status === s
                  ? (s === 'approved' ? '#0a5c36' : '#842029')
                  : 'var(--ink2)',
                fontWeight: 700, fontSize: 15,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {s === 'approved' ? '✅ אישור' : '❌ דחייה'}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>נימוק (לא חובה)</span>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="כתוב/י הסבר לתלמיד..."
            rows={3}
            style={{
              width: '100%', padding: '9px 12px', fontSize: 14,
              border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
              background: 'var(--bg)', color: 'var(--ink)',
              fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={ghostBtn}>ביטול</button>
          <button
            onClick={() => { onRespond(status, response); onClose(); }}
            style={{
              background: 'var(--ac)', color: '#fff', border: 'none',
              borderRadius: 'var(--rs)', padding: '9px 22px',
              fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            שמור תגובה
          </button>
        </div>
      </div>
    </div>
  );
}

function ShareModal({ data, onClose }: { data: SharedClassroomData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const encoded = encodeShareData(data);
  const base = window.location.href.split('#')[0];
  const url = `${base}#/request?d=${encoded}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`📝 בקשת מעבר מקום ישיבה — ${data.name}\n${url}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg2)', borderRadius: 'var(--r)', padding: 28,
        maxWidth: 500, width: '100%', boxShadow: 'var(--sh)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>📤 שתף קישור לתלמידים</h3>
        <p style={{ margin: '0 0 18px', color: 'var(--ink2)', fontSize: 13, lineHeight: 1.5 }}>
          שלח/י לתלמידים את הקישור הזה. הם יוכלו להגיש בקשת מעבר מקום ישיבה, ובסיום ישלחו לך קישור חזרה.
        </p>

        <div style={{
          background: 'var(--bg)', border: '1px solid var(--bd)',
          borderRadius: 'var(--rs)', padding: '10px 14px',
          fontSize: 12, color: 'var(--ink2)', wordBreak: 'break-all',
          marginBottom: 16, direction: 'ltr', textAlign: 'left',
        }}>
          {url}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={handleCopy} style={{
            background: copied ? '#4CAF50' : 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '9px 18px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {copied ? '✔ הועתק!' : '📋 העתק קישור'}
          </button>
          <button onClick={handleWhatsApp} style={{
            background: '#25D366', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '9px 18px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            📲 שלח ב-WhatsApp
          </button>
        </div>

        <div style={{ textAlign: 'left' }}>
          <button onClick={onClose} style={ghostBtn}>סגור</button>
        </div>
      </div>
    </div>
  );
}

export default function RequestsDashboard() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const classroom = useClassroomStore((s) => (id ? s.classrooms[id] : undefined));
  const setCurrent = useClassroomStore((s) => s.setCurrent);
  const students = useStudentsStore((s) => (id ? (s.byClassroom[id] ?? []) : []));

  const requests = useRequestsStore((s) => (id ? s.get(id) : []));
  const addRequest = useRequestsStore((s) => s.add);
  const respond = useRequestsStore((s) => s.respond);
  const removeRequest = useRequestsStore((s) => s.remove);

  const [respondingTo, setRespondingTo] = useState<SeatRequest | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [filter, setFilter] = useState<SeatRequestStatus | 'all'>('all');

  useEffect(() => { if (id) setCurrent(id); }, [id, setCurrent]);

  // ייבוא אוטומטי של בקשה שהגיעה ב-URL
  useEffect(() => {
    if (!id || !classroom) return;
    const raw = searchParams.get('req');
    if (!raw) return;
    const decoded = decodeIncomingRequest(raw);
    if (!decoded || decoded.classroomId !== id) return;
    addRequest({
      classroomId: id,
      classroomName: classroom.name,
      requesterName: decoded.requesterName,
      preferredNear: decoded.preferredNear,
      message: decoded.message ?? '',
    });
    setImportedName(decoded.requesterName);
    setSearchParams({}, { replace: true });
  }, [id, classroom, searchParams, setSearchParams, addRequest]);

  if (!classroom) {
    return (
      <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink3)' }}>
        <p>הכיתה לא נמצאה.</p>
        <button onClick={() => navigate('/')} style={{
          background: 'var(--ac)', color: '#fff', border: 'none',
          borderRadius: 'var(--rs)', padding: '10px 20px', fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>חזרה לרשימת כיתות</button>
      </div>
    );
  }

  const shareData: SharedClassroomData = {
    classroomId: classroom.id,
    name: classroom.name,
    students: students.map((s) => s.name),
  };

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <ClassroomNav classroomId={classroom.id} classroomName={classroom.name} />

      {importedName && (
        <div style={{
          background: '#d1e7dd', border: '1px solid #a3cfbb', borderRadius: 'var(--rs)',
          padding: '10px 16px', marginBottom: 16, color: '#0a5c36', fontWeight: 700, fontSize: 14,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          ✅ בקשה מ-{importedName} נוספה בהצלחה!
          <button onClick={() => setImportedName(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* כותרת ופעולות */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>
            📬 בקשות מעבר מקום
            {pendingCount > 0 && (
              <span style={{
                marginRight: 8, background: 'var(--ac)', color: '#fff',
                borderRadius: 20, padding: '2px 9px', fontSize: 13, fontWeight: 700,
              }}>
                {pendingCount} ממתינות
              </span>
            )}
          </h2>
          <p style={{ margin: 0, color: 'var(--ink2)', fontSize: 13 }}>
            תלמידים יכולים לשלוח בקשות דרך הקישור המשותף
          </p>
        </div>
        <button
          onClick={() => setShowShare(true)}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '10px 18px',
            fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          📤 שתף קישור לתלמידים
        </button>
      </div>

      {/* פילטר */}
      {requests.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['all', 'pending', 'approved', 'denied'] as const).map((f) => {
            const labels = { all: 'הכל', pending: 'ממתינות', approved: 'אושרו', denied: 'נדחו' };
            const counts = {
              all: requests.length,
              pending: requests.filter(r => r.status === 'pending').length,
              approved: requests.filter(r => r.status === 'approved').length,
              denied: requests.filter(r => r.status === 'denied').length,
            };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', border: '1px solid var(--bd)', borderRadius: 20,
                  background: filter === f ? 'var(--ac)' : 'var(--bg2)',
                  color: filter === f ? '#fff' : 'var(--ink2)',
                  fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {labels[f]} ({counts[f]})
              </button>
            );
          })}
        </div>
      )}

      {/* רשימת בקשות */}
      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
          padding: '48px 24px', textAlign: 'center', color: 'var(--ink3)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          {requests.length === 0
            ? 'עדיין לא הוגשו בקשות. שתף/י את הקישור עם התלמידים.'
            : 'אין בקשות בקטגוריה זו.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((req) => (
            <div
              key={req.id}
              style={{
                background: 'var(--bg2)', border: '1px solid var(--bd)',
                borderRadius: 'var(--r)', padding: '16px 20px',
                display: 'flex', gap: 16, alignItems: 'flex-start',
                borderRight: `4px solid ${req.status === 'approved' ? '#2e7d32' : req.status === 'denied' ? '#c62828' : 'var(--ac)'}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{req.requesterName}</span>
                  <span style={{ color: 'var(--ink3)', fontSize: 13 }}>→ ליד</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{req.preferredNear}</span>
                  <StatusBadge status={req.status} />
                </div>
                {req.message && (
                  <p style={{ margin: '0 0 6px', color: 'var(--ink2)', fontSize: 13, lineHeight: 1.5 }}>
                    💬 {req.message}
                  </p>
                )}
                {req.response && (
                  <p style={{
                    margin: '0 0 6px',
                    color: req.status === 'approved' ? '#0a5c36' : '#842029',
                    fontSize: 13, fontWeight: 600,
                  }}>
                    ↩ תגובתך: {req.response}
                  </p>
                )}
                <span style={{ fontSize: 12, color: 'var(--ink3)' }}>{formatDate(req.createdAt)}</span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => setRespondingTo(req)}
                  style={{
                    background: req.status === 'pending' ? 'var(--ac)' : 'var(--bg)',
                    color: req.status === 'pending' ? '#fff' : 'var(--ink2)',
                    border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
                    padding: '7px 14px', fontWeight: 700, fontSize: 13,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {req.status === 'pending' ? 'הגב' : 'ערוך תגובה'}
                </button>
                <button
                  onClick={() => { if (confirm('למחוק את הבקשה?')) removeRequest(req.classroomId, req.id); }}
                  style={{
                    background: 'none', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
                    padding: '7px 10px', color: 'var(--ink3)', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 15,
                  }}
                  title="מחק בקשה"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {respondingTo && (
        <RespondModal
          req={respondingTo}
          onClose={() => setRespondingTo(null)}
          onRespond={(status, response) => respond(respondingTo.classroomId, respondingTo.id, status, response)}
        />
      )}

      {showShare && (
        <ShareModal data={shareData} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  background: 'none', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
  padding: '9px 18px', fontWeight: 600, fontSize: 14,
  cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink2)',
};
