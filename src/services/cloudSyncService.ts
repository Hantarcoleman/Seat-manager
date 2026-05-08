// סנכרון נתוני המשתמש עם Supabase — fallback שקט אם אין חיבור
import { supabase } from './supabaseClient';
import type { Classroom, Student, SeatingArrangement } from '../types';

export interface HistoryEntry {
  id: string;
  classroomId: string;
  classroomName: string;
  name: string;
  createdAt: string;
  data: SeatingArrangement;
}

// ── מבנה הנתונים ב-Supabase ──────────────────────────────────────────────────
// טבלה: user_app_data (user_id PK, classrooms_data jsonb, students_data jsonb, arrangements_data jsonb)
// טבלה: arrangement_history (id, user_id, classroom_id, classroom_name, name, data jsonb, created_at)

async function getUid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// ── Push: שמור את כל הנתונים ──────────────────────────────────────────────
export async function pushUserData(
  classrooms: Record<string, Classroom>,
  students: Record<string, Student[]>,
  arrangements: Record<string, SeatingArrangement>,
): Promise<void> {
  if (!supabase) return;
  const uid = await getUid();
  if (!uid) return;
  await supabase.from('user_app_data').upsert({
    user_id: uid,
    classrooms_data: classrooms,
    students_data: students,
    arrangements_data: arrangements,
    updated_at: new Date().toISOString(),
  });
}

// ── Pull: טעינת נתוני משתמש מהענן ─────────────────────────────────────────
export async function pullUserData(): Promise<{
  classrooms: Record<string, Classroom>;
  students: Record<string, Student[]>;
  arrangements: Record<string, SeatingArrangement>;
} | null> {
  if (!supabase) return null;
  const uid = await getUid();
  if (!uid) return null;
  const { data } = await supabase
    .from('user_app_data')
    .select('classrooms_data, students_data, arrangements_data')
    .eq('user_id', uid)
    .single();
  if (!data) return null;
  return {
    classrooms: (data.classrooms_data ?? {}) as Record<string, Classroom>,
    students: (data.students_data ?? {}) as Record<string, Student[]>,
    arrangements: (data.arrangements_data ?? {}) as Record<string, SeatingArrangement>,
  };
}

// ── שמירת סידור להיסטוריה ─────────────────────────────────────────────────
export async function saveArrangementHistory(
  arrangement: SeatingArrangement,
  classroomName: string,
): Promise<void> {
  if (!supabase) return;
  const uid = await getUid();
  if (!uid) return;
  await supabase.from('arrangement_history').upsert({
    id: arrangement.id,
    user_id: uid,
    classroom_id: arrangement.classroomId,
    classroom_name: classroomName,
    name: arrangement.name,
    data: arrangement,
    created_at: arrangement.createdAt,
  });
}

// ── טעינת היסטוריה לפי כיתה ──────────────────────────────────────────────
export async function loadHistory(classroomId: string): Promise<HistoryEntry[]> {
  if (!supabase) return [];
  const uid = await getUid();
  if (!uid) return [];
  const { data } = await supabase
    .from('arrangement_history')
    .select('id, classroom_id, classroom_name, name, created_at, data')
    .eq('user_id', uid)
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (!data) return [];
  return data.map((r) => ({
    id: r.id,
    classroomId: r.classroom_id,
    classroomName: r.classroom_name ?? '',
    name: r.name ?? '',
    createdAt: r.created_at,
    data: r.data as SeatingArrangement,
  }));
}
