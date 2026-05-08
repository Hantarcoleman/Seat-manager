import { useAuthStore } from '../../store/authStore';
import { isSupabaseEnabled } from '../../services/supabaseClient';

export default function LoginPage() {
  const { signInWithGoogle, loading } = useAuthStore();

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--bd)',
        borderRadius: 'var(--r)', padding: '52px 44px',
        boxShadow: 'var(--sh)', textAlign: 'center', maxWidth: 400, width: '100%',
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>📐</div>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 8px' }}>סידור חכם לכיתה</h1>
        <p style={{ color: 'var(--ink2)', fontSize: 14, marginBottom: 36, lineHeight: 1.7 }}>
          התחבר עם חשבון Google שלך<br />כדי לשמור את הכיתות שלך בענן ולגשת אליהן מכל מקום
        </p>

        {loading ? (
          <div style={{ color: 'var(--ink3)', fontSize: 14 }}>⏳ בודק התחברות...</div>
        ) : !isSupabaseEnabled() ? (
          <div style={{
            background: '#fef3c7', border: '1px solid #fde68a',
            borderRadius: 'var(--rs)', padding: 16, fontSize: 13, color: '#92400e', lineHeight: 1.6,
          }}>
            ⚙ Supabase לא מוגדר<br />
            <a href="/" style={{ color: 'var(--ac)', fontWeight: 700, textDecoration: 'none' }}>
              המשך ללא התחברות ←
            </a>
          </div>
        ) : (
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, margin: '0 auto',
              background: '#fff', color: '#1c1917',
              border: '1.5px solid #e2e8f0', borderRadius: 'var(--rs)',
              padding: '13px 28px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 2px 6px rgba(0,0,0,0.07)',
            }}
          >
            <GoogleIcon />
            התחבר עם Google
          </button>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}
