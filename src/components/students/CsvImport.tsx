import { useState, useRef } from 'react';
import { importStudentsFile, importRowsToStudents, type ImportRow } from '../../services/csvImportService';

interface Props {
  onImport: (rows: ReturnType<typeof importRowsToStudents>) => void;
  onCancel: () => void;
}

export default function CsvImport({ onImport, onCancel }: Props) {
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setError('');
    setFileName(file.name);
    try {
      const parsed = await importStudentsFile(file);
      if (parsed.length === 0) {
        setError('לא נמצאו תלמידים בקובץ. ודא שיש עמודה בשם "שם" או "name".');
        setRows(null);
        return;
      }
      setRows(parsed);
    } catch (e) {
      setError('שגיאה בפענוח הקובץ. נסה קובץ CSV או Excel תקין.');
      console.error(e);
      setRows(null);
    }
  };

  const confirm = () => {
    if (!rows) return;
    onImport(importRowsToStudents(rows));
  };

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--bd)', borderRadius: 'var(--r)',
      padding: 20, boxShadow: 'var(--sh)',
    }}>
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>📥 ייבוא תלמידים מקובץ</h3>

      <div style={{
        background: 'var(--abg)', border: '1px solid var(--abd)', borderRadius: 'var(--rs)',
        padding: 12, marginBottom: 16, fontSize: 13, color: '#9a3412',
      }}>
        <div style={{ marginBottom: 4, fontWeight: 700 }}>פורמט נתמך:</div>
        <div style={{ fontSize: 12 }}>
          קובץ <strong>CSV</strong> או <strong>Excel (xlsx/xls)</strong> עם עמודות:
          <br />• <strong>שם</strong> (חובה) — שם התלמיד
          <br />• <strong>מגדר / מין</strong> (אופציונלי) — בן/בת או ז/נ
          <br />• <strong>הערות</strong> (אופציונלי)
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => inputRef.current?.click()}
          style={{
            background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '10px 20px', fontWeight: 800,
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
          }}
        >
          📁 בחר קובץ
        </button>
        {fileName && <span style={{ fontSize: 13, color: 'var(--ink2)', alignSelf: 'center' }}>{fileName}</span>}
      </div>

      {error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--rs)',
          padding: 10, marginBottom: 16, color: '#991b1b', fontSize: 13,
        }}>⚠ {error}</div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
            ✓ נמצאו <span style={{ color: 'var(--ac)' }}>{rows.length}</span> תלמידים:
          </div>
          <div style={{
            maxHeight: 240, overflow: 'auto',
            border: '1px solid var(--bd)', borderRadius: 'var(--rs)',
          }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg)', position: 'sticky', top: 0 }}>
                  <th style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid var(--bd)' }}>#</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid var(--bd)' }}>שם</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid var(--bd)' }}>מגדר</th>
                  <th style={{ padding: '6px 12px', textAlign: 'right', borderBottom: '1px solid var(--bd)' }}>הערות</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--bd)' }}>
                    <td style={{ padding: '6px 12px', color: 'var(--ink3)' }}>{i + 1}</td>
                    <td style={{ padding: '6px 12px', fontWeight: 600 }}>{r.name}</td>
                    <td style={{ padding: '6px 12px' }}>{r.gender === 'm' ? 'בן' : r.gender === 'f' ? 'בת' : '—'}</td>
                    <td style={{ padding: '6px 12px', color: 'var(--ink3)', fontSize: 12 }}>{r.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
            ⚠ הייבוא ידרוס את רשימת התלמידים הנוכחית בכיתה.
          </p>
        </div>
      )}

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
          onClick={confirm}
          disabled={!rows || rows.length === 0}
          style={{
            background: 'var(--gn)', color: '#fff', border: 'none',
            borderRadius: 'var(--rs)', padding: '8px 22px', fontWeight: 800, fontSize: 14,
            cursor: rows && rows.length > 0 ? 'pointer' : 'not-allowed',
            opacity: rows && rows.length > 0 ? 1 : 0.5, fontFamily: 'inherit',
          }}
        >
          ✓ ייבא {rows?.length ?? 0} תלמידים
        </button>
      </div>
    </div>
  );
}
