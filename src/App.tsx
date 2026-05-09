import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ClassroomSetup from './pages/ClassroomSetup';
import StudentsPage from './pages/StudentsPage';
import SeatingPage from './pages/SeatingPage';
import RequestsDashboard from './pages/RequestsDashboard';
import StudentRequestPage from './pages/StudentRequestPage';
import LoginPage from './components/auth/LoginPage';
import { useAuthStore } from './store/authStore';
import { useCloudSync } from './hooks/useCloudSync';
import { isSupabaseEnabled } from './services/supabaseClient';
import { useIsMobile } from './hooks/useIsMobile';
import './App.css';

function AppShell() {
  const { user, loading, signOut } = useAuthStore();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isClassroomRoute = location.pathname.startsWith('/classroom/');
  // במובייל בתוך כיתה — MobileClassroomView מכסה הכל, מסתירים header ו-padding
  const hideChrome = isMobile && isClassroomRoute;
  useCloudSync();

  // אם Supabase מוגדר ועוד מחכים לתשובה
  if (isSupabaseEnabled() && loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--ink2)', fontSize: 16 }}>⏳ טוען...</div>
      </div>
    );
  }

  // אם Supabase מוגדר ואין משתמש — הצג דף התחברות
  if (isSupabaseEnabled() && !user) {
    return <LoginPage />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header style={{
        background: 'var(--bg2)', borderBottom: '1px solid var(--bd)',
        padding: '12px 24px', display: hideChrome ? 'none' : 'flex', alignItems: 'center', gap: 16,
        boxShadow: 'var(--sh)',
      }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--ink)', flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>📐 סידור חכם לכיתה</h1>
        </Link>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {user.user_metadata?.avatar_url && (
              <img src={user.user_metadata.avatar_url} alt=""
                style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--bd)' }} />
            )}
            <span style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 600 }}>
              {user.user_metadata?.full_name ?? user.email}
            </span>
            <button
              onClick={signOut}
              style={{
                background: 'none', border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
                padding: '5px 12px', fontSize: 12, color: 'var(--ink2)',
                cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              }}
            >
              יציאה
            </button>
          </div>
        )}
      </header>

      <main style={{ maxWidth: hideChrome ? undefined : 1280, margin: hideChrome ? undefined : '0 auto', padding: hideChrome ? 0 : '24px' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/classroom/:id/setup" element={<ClassroomSetup />} />
          <Route path="/classroom/:id/students" element={<StudentsPage />} />
          <Route path="/classroom/:id/seating" element={<SeatingPage />} />
          <Route path="/classroom/:id/requests" element={<RequestsDashboard />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* נתיב ציבורי — ללא הדר ואימות */}
        <Route path="/request" element={<StudentRequestPage />} />
        {/* כל שאר הנתיבים — עם AppShell */}
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </HashRouter>
  );
}
