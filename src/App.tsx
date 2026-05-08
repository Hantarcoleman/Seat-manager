import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ClassroomSetup from './pages/ClassroomSetup';
import DeskLayoutPage from './pages/DeskLayoutPage';
import StudentsPage from './pages/StudentsPage';
import SeatingPage from './pages/SeatingPage';
import LoginPage from './components/auth/LoginPage';
import { useAuthStore } from './store/authStore';
import { useCloudSync } from './hooks/useCloudSync';
import { isSupabaseEnabled } from './services/supabaseClient';
import './App.css';

function AppShell() {
  const { user, loading, signOut } = useAuthStore();
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
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 16,
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

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/classroom/:id/setup" element={<ClassroomSetup />} />
          <Route path="/classroom/:id/desks" element={<DeskLayoutPage />} />
          <Route path="/classroom/:id/students" element={<StudentsPage />} />
          <Route path="/classroom/:id/seating" element={<SeatingPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppShell />
    </BrowserRouter>
  );
}
