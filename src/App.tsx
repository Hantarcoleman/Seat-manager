import './App.css';

function App() {
  return (
    <div style={{ minHeight: '100vh', padding: '40px 20px', maxWidth: 920, margin: '0 auto' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 36, fontWeight: 900, margin: 0, color: 'var(--ink)' }}>
          סידור חכם לכיתה
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 16, marginTop: 8 }}>
          כלי לבניית סידור הושבה חכם — מבנה כיתה, שולחנות, ותלמידים.
        </p>
      </header>

      <div className="privacy-note" style={{ marginBottom: 24 }}>
        🔒 המידע נשמר מקומית במכשיר שלך ואינו נשלח לשרת.
      </div>

      <section style={{
        background: 'var(--bg2)',
        border: '1px solid var(--bd)',
        borderRadius: 'var(--r)',
        padding: 24,
        boxShadow: 'var(--sh)',
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginTop: 0 }}>
          ⚙️ שלב 0 — Setup הושלם
        </h2>
        <ul style={{ color: 'var(--ink2)', lineHeight: 1.9 }}>
          <li>✓ Vite + React + TypeScript</li>
          <li>✓ Tailwind CSS עם RTL</li>
          <li>✓ פונט Heebo</li>
          <li>✓ ספריות: react-konva, dnd-kit, papaparse, xlsx, zustand, react-router-dom, supabase-js</li>
        </ul>
        <p style={{ color: 'var(--ink3)', fontSize: 13, marginTop: 16 }}>
          השלב הבא: בניית המודלים והעורך הוויזואלי של החדר.
        </p>
      </section>
    </div>
  );
}

export default App;
