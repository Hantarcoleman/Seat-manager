// ייבוא תלמידים מקובץ CSV או Excel
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Student, StudentTag } from '../types';

export interface ImportRow {
  name: string;
  gender?: 'm' | 'f';
  tags?: StudentTag[];
  notes?: string;
}

// ── זיהוי עמודה בעברית/אנגלית ─────────────────────────
function findColumn(headers: string[], aliases: string[]): number {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[׳"'.\s]/g, '');
  const aliasSet = new Set(aliases.map(norm));
  for (let i = 0; i < headers.length; i++) {
    if (aliasSet.has(norm(headers[i]))) return i;
  }
  return -1;
}

const NAME_ALIASES = ['שם', 'שםהתלמיד', 'שםמלא', 'name', 'fullname', 'student'];
const GENDER_ALIASES = ['מגדר', 'מין', 'gender', 'sex'];
const NOTES_ALIASES = ['הערות', 'הערה', 'notes', 'note', 'comment'];

function parseGender(v: string): 'm' | 'f' | undefined {
  const t = v.trim().toLowerCase();
  if (t === 'נ' || t === 'נקבה' || t === 'בת' || t === 'f' || t === 'female') return 'f';
  if (t === 'ז' || t === 'זכר' || t === 'בן' || t === 'm' || t === 'male')   return 'm';
  return undefined;
}

// ── המרה גנרית מ-rows למבנה Student ─────────────────
function rowsToStudents(rows: string[][], hasHeader = true): ImportRow[] {
  if (rows.length === 0) return [];
  let headers: string[] = [];
  let dataRows: string[][] = rows;
  if (hasHeader) {
    headers = rows[0];
    dataRows = rows.slice(1);
  }
  const nameCol = hasHeader ? findColumn(headers, NAME_ALIASES) : 0;
  const genderCol = hasHeader ? findColumn(headers, GENDER_ALIASES) : -1;
  const notesCol = hasHeader ? findColumn(headers, NOTES_ALIASES) : -1;

  const result: ImportRow[] = [];
  for (const row of dataRows) {
    const name = (nameCol >= 0 ? row[nameCol] : row[0])?.trim();
    if (!name) continue;
    const gender = genderCol >= 0 && row[genderCol] ? parseGender(row[genderCol]) : undefined;
    const notes = notesCol >= 0 && row[notesCol] ? row[notesCol].trim() : undefined;
    result.push({ name, gender, notes });
  }
  return result;
}

// ── ייבוא CSV ─────────────────────────────────────────
export async function importCsvFile(file: File): Promise<ImportRow[]> {
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return rowsToStudents(parsed.data as string[][], true);
}

// ── ייבוא Excel ───────────────────────────────────────
export async function importExcelFile(file: File): Promise<ImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false });
  return rowsToStudents(rows as string[][], true);
}

// ── ייבוא לפי סוג הקובץ ───────────────────────────────
export async function importStudentsFile(file: File): Promise<ImportRow[]> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return importCsvFile(file);
  if (ext === 'xlsx' || ext === 'xls') return importExcelFile(file);
  // ניסיון אוטומטי — נתחיל עם csv
  return importCsvFile(file);
}

// ── המרה מ-ImportRow ל-Student מלא (לפני ה-id) ───────
export function importRowsToStudents(rows: ImportRow[]): Omit<Student, 'id'>[] {
  return rows.map((r) => ({
    name: r.name,
    gender: r.gender,
    tags: r.tags ?? [],
    preferredNear: [],
    avoidNear: [],
    mustSeparate: [],
    responsibilityScore: 70,
    notes: r.notes,
  }));
}
