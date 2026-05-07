import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ClassroomSetup from './pages/ClassroomSetup';
import DeskLayoutPage from './pages/DeskLayoutPage';
import StudentsPage from './pages/StudentsPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <header style={{
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--bd)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          boxShadow: 'var(--sh)',
        }}>
          <Link to="/" style={{ textDecoration: 'none', color: 'var(--ink)' }}>
            <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              📐 סידור חכם לכיתה
            </h1>
          </Link>
        </header>

        <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/classroom/:id/setup" element={<ClassroomSetup />} />
            <Route path="/classroom/:id/desks" element={<DeskLayoutPage />} />
            <Route path="/classroom/:id/students" element={<StudentsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
