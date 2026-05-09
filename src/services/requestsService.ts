// שירות Supabase לבקשות מעבר מקום ישיבה
import { supabase } from './supabaseClient';
import type { SeatRequest, SeatRequestStatus } from '../types';

interface DbRow {
  id: string;
  classroom_id: string;
  classroom_name: string;
  requester_name: string;
  preferred_near: string;
  message: string;
  status: SeatRequestStatus;
  response: string | null;
  created_at: string;
  responded_at: string | null;
}

function rowToRequest(row: DbRow): SeatRequest {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name,
    requesterName: row.requester_name,
    preferredNear: row.preferred_near,
    message: row.message,
    status: row.status,
    response: row.response ?? undefined,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? undefined,
  };
}

// הגשת בקשה — ללא התחברות (תלמיד)
export async function submitRequest(req: {
  classroomId: string;
  classroomName: string;
  requesterName: string;
  preferredNear: string;
  message: string;
}): Promise<{ id: string } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('seat_requests')
    .insert({
      classroom_id: req.classroomId,
      classroom_name: req.classroomName,
      requester_name: req.requesterName,
      preferred_near: req.preferredNear,
      message: req.message,
    })
    .select('id')
    .single();
  if (error) { console.error('submitRequest:', error); return null; }
  return data;
}

// טעינת כל הבקשות לכיתה — למורה
export async function fetchRequests(classroomId: string): Promise<SeatRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('seat_requests')
    .select('*')
    .eq('classroom_id', classroomId)
    .order('created_at', { ascending: false });
  if (error) { console.error('fetchRequests:', error); return []; }
  return (data as DbRow[]).map(rowToRequest);
}

// עדכון תגובת מורה
export async function respondToRequest(
  id: string,
  status: SeatRequestStatus,
  response: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('seat_requests')
    .update({ status, response, responded_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error('respondToRequest:', error); return false; }
  return true;
}

// מחיקת בקשה
export async function deleteRequest(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('seat_requests').delete().eq('id', id);
  if (error) { console.error('deleteRequest:', error); return false; }
  return true;
}

// ── שיתוף כיתה ─────────────────────────────────────────────

// שמירת נתוני כיתה לשיתוף — מייצר קישור קצר ללא base64
export async function upsertClassroomShare(data: {
  classroomId: string;
  classroomName: string;
  students: string[];
}): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('classroom_shares').upsert({
    classroom_id: data.classroomId,
    classroom_name: data.classroomName,
    students: data.students,
    updated_at: new Date().toISOString(),
  });
  if (error) { console.error('upsertClassroomShare:', error); return false; }
  return true;
}

// טעינת נתוני כיתה לטופס התלמיד
export async function fetchClassroomShare(classroomId: string): Promise<{
  classroomName: string;
  students: string[];
} | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('classroom_shares')
    .select('classroom_name, students')
    .eq('classroom_id', classroomId)
    .single();
  if (error || !data) return null;
  return { classroomName: data.classroom_name, students: data.students as string[] };
}

// מנוי real-time — קריאה אוטומטית כשמגיעה בקשה חדשה
export function subscribeToRequests(
  classroomId: string,
  onChange: () => void,
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`seat_requests_${classroomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'seat_requests', filter: `classroom_id=eq.${classroomId}` },
      onChange,
    )
    .subscribe();
  return () => { supabase!.removeChannel(channel); };
}
