// ייבוא תלמידים מקובץ CSV או Excel.
// ⚠ פרטיות: מתעלם בכוונה מכל מידע שהוא לא שם המשפחה+הפרטי+המין.
// אסור לקרוא, לשמור או להעביר ת.ז, תאריכי לידה, פרטי הורים, כתובות, טלפונים, מיילים.
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Student, StudentTag } from '../types';

export interface ImportRow {
  name: string;
  gender?: 'm' | 'f';
  tags?: StudentTag[];
}

// ── זיהוי עמודה ─────────────────────────────────────
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[׳"'.\s־-]/g, '');
}

function findColumn(headers: string[], aliases: string[]): number {
  const aliasSet = new Set(aliases.map(norm));
  for (let i = 0; i < headers.length; i++) {
    if (aliasSet.has(norm(headers[i]))) return i;
  }
  return -1;
}

const NAME_ALIASES = [
  'שם', 'שם התלמיד', 'שם תלמיד', 'שם מלא', 'שם פרטי ומשפחה',
  'name', 'fullname', 'student', 'studentname',
];
const FIRST_NAME_ALIASES = ['שם פרטי', 'שם הפרטי', 'firstname', 'first'];
const LAST_NAME_ALIASES = ['שם משפחה', 'שם המשפחה', 'lastname', 'last', 'surname', 'family'];
const GENDER_ALIASES = ['מין', 'מגדר', 'gender', 'sex'];

// ── הסבר הפורמטים שמותר/אסור ──────────────────────
function parseGender(v: string): 'm' | 'f' | undefined {
  const t = v.trim().toLowerCase();
  if (t === 'נ' || t === 'נקבה' || t === 'בת' || t === 'f' || t === 'female') return 'f';
  if (t === 'ז' || t === 'זכר' || t === 'בן' || t === 'm' || t === 'male')   return 'm';
  return undefined;
}

// מאתר אוטומטית את שורת ה-headers בקבצי אלפון רשמיים שמתחילים בשורות כותרת
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    // שורת headers — מכילה לפחות אחת ממילות המפתח
    const allAliases = [...NAME_ALIASES, ...FIRST_NAME_ALIASES, ...LAST_NAME_ALIASES];
    const aliasSet = new Set(allAliases.map(norm));
    const hits = r.filter((cell) => cell && aliasSet.has(norm(String(cell)))).length;
    if (hits > 0) return i;
  }
  return 0;
}

// ── המרה גנרית מ-rows למבנה ImportRow[] ────────────
function rowsToStudents(rows: string[][]): ImportRow[] {
  if (rows.length === 0) return [];
  const headerIdx = findHeaderRow(rows);
  const headers = rows[headerIdx] ?? [];
  const dataRows = rows.slice(headerIdx + 1);

  // עמודות שמותר לקרוא — בלבד שם + מין
  const fullNameCol = findColumn(headers, NAME_ALIASES);
  const firstCol    = findColumn(headers, FIRST_NAME_ALIASES);
  const lastCol     = findColumn(headers, LAST_NAME_ALIASES);
  const genderCol   = findColumn(headers, GENDER_ALIASES);

  const result: ImportRow[] = [];
  for (const row of dataRows) {
    if (!row || row.length === 0) continue;
    let name = '';
    if (fullNameCol >= 0 && row[fullNameCol]) {
      name = String(row[fullNameCol]).trim();
    } else if (firstCol >= 0 || lastCol >= 0) {
      const first = firstCol >= 0 ? String(row[firstCol] ?? '').trim() : '';
      const last  = lastCol  >= 0 ? String(row[lastCol]  ?? '').trim() : '';
      name = [last, first].filter(Boolean).join(' ').trim();
    } else {
      // fallback: עמודה ראשונה לא-מספרית
      for (const cell of row) {
        const c = String(cell ?? '').trim();
        if (c && !/^\d+$/.test(c)) { name = c; break; }
      }
    }
    if (!name) continue;
    // סינון שורות סיכום או כותרת — אם השם זהה לכותרת
    const normName = norm(name);
    if (NAME_ALIASES.some((a) => norm(a) === normName)) continue;

    const gender = genderCol >= 0 && row[genderCol] ? parseGender(String(row[genderCol])) : undefined;
    // ⚠ במכוון לא שומר: ת.ז, תאריך לידה, כתובת, טלפון, אימייל, פרטי הורים
    result.push({ name, gender });
  }
  return result;
}

// ── ייבוא CSV ─────────────────────────────────────────
export async function importCsvFile(file: File): Promise<ImportRow[]> {
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return rowsToStudents(parsed.data as string[][]);
}

// ── ייבוא Excel ───────────────────────────────────────
export async function importExcelFile(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
  return rowsToStudents(rows as string[][]);
}

// ── ייבוא לפי סוג הקובץ ───────────────────────────────
export async function importStudentsFile(file: File): Promise<ImportRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls') return importExcelFile(file);
  return importCsvFile(file);
}

// ── המרה ל-Student ────────────────────────────────────
export function importRowsToStudents(rows: ImportRow[]): Omit<Student, 'id'>[] {
  return rows.map((r) => ({
    name: r.name,
    gender: r.gender,
    tags: r.tags ?? [],
    preferredNear: [],
    avoidNear: [],
    responsibilityScore: 70,
    notes: undefined,
    configured: false, // טרם אופיין ע"י המורה
  }));
}
