// ייצוא / ייבוא נתונים — JSON מקומי + sync אופציונלי ל-Supabase
import type { Classroom, Student, SeatingArrangement } from '../types';
import { supabase } from './supabaseClient';

export interface ExportBundle {
  version: 3;
  exportedAt: string;
  classroom: Classroom;
  students: Student[];
  arrangements: SeatingArrangement[];
}

// ── ייצוא ──────────────────────────────────────────────────────────────────

export function exportToJson(
  classroom: Classroom,
  students: Student[],
  arrangements: SeatingArrangement[]
): void {
  const bundle: ExportBundle = {
    version: 3,
    exportedAt: new Date().toISOString(),
    classroom,
    students,
    arrangements,
  };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `seating-${classroom.name || classroom.id}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── ייבוא ──────────────────────────────────────────────────────────────────

export function importFromJson(file: File): Promise<ExportBundle> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        if (!raw.version || !raw.classroom || !Array.isArray(raw.students)) {
          reject(new Error('קובץ לא תקין — חסרים שדות חובה'));
          return;
        }
        resolve(raw as ExportBundle);
      } catch {
        reject(new Error('שגיאה בקריאת הקובץ — ודא שזה JSON תקין'));
      }
    };
    reader.onerror = () => reject(new Error('שגיאה בפתיחת הקובץ'));
    reader.readAsText(file, 'utf-8');
  });
}

// ── Supabase sync (אופציונלי) ──────────────────────────────────────────────

export async function syncToSupabase(bundle: ExportBundle): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('seating_bundles')
    .upsert({
      classroom_id: bundle.classroom.id,
      data: bundle,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`שגיאת Supabase: ${error.message}`);
}

export async function loadFromSupabase(classroomId: string): Promise<ExportBundle | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('seating_bundles')
    .select('data')
    .eq('classroom_id', classroomId)
    .single();
  if (error || !data) return null;
  return data.data as ExportBundle;
}
