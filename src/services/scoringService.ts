// הסבר שיבוץ פר-תלמיד + ניקוד כולל
import type { Classroom, Student, SeatingArrangement, ArrangementWarning, ZoneTag } from '../types';
import { validateAssignments, scoreArrangement } from './seatingValidator';

export interface PlacementReason {
  tag: string;       // emoji + תיוג
  satisfied: boolean;
  note: string;
}

export interface PlacementExplanation {
  studentId: string;
  seatId: string | null;   // null = בחנייה
  reasons: PlacementReason[];
  warnings: ArrangementWarning[];
}

export interface FullScore {
  score: number;
  warnings: ArrangementWarning[];
  hardCount: number;
  softCount: number;
  summary: string;
}

export function getPlacementExplanation(
  studentId: string,
  arr: SeatingArrangement,
  classroom: Classroom,
  students: Student[]
): PlacementExplanation {
  const student = students.find((s) => s.id === studentId);
  if (!student) return { studentId, seatId: null, reasons: [], warnings: [] };

  const assignment = arr.assignments.find((a) => a.studentId === studentId);
  const seatId = assignment?.seatId ?? null;
  const seat = seatId ? classroom.seats.find((s) => s.id === seatId) : null;
  const zones = seat
    ? new Set<ZoneTag>([...(seat.autoZones ?? []), ...(seat.manualZones ?? [])])
    : new Set<ZoneTag>();

  const reasons: PlacementReason[] = [];
  const f = student.gender === 'f';

  if (student.tags.includes('needs_very_front')) {
    const ok = zones.has('front_row');
    reasons.push({
      tag: '🔴 חייב/ת שורה קדמית ביותר',
      satisfied: ok,
      note: ok ? 'יושב/ת בשורה הקדמית ביותר ✓' : 'לא בשורה הקדמית ביותר ✗',
    });
  }

  if (student.tags.includes('needs_front')) {
    const ok = zones.has('front_row') || zones.has('second_row');
    reasons.push({
      tag: '👓 חייב/ת אחת משתי שורות קדמיות',
      satisfied: ok,
      note: ok ? 'יושב/ת בשורה קדמית ✓' : 'לא בשתי השורות הקדמיות ✗',
    });
  }

  if (student.tags.includes('tall')) {
    const ok = zones.has('back_row') || zones.has('side_column');
    reasons.push({
      tag: '📏 גבוה/ה',
      satisfied: ok,
      note: ok ? 'יושב/ת מאחור או בצד ✓' : 'עלול/ה להסתיר ✗',
    });
  }

  if (student.tags.includes('better_alone')) {
    const ok = seat?.side === 'solo';
    reasons.push({
      tag: '⭐ כדאי שישב/תשב לבד',
      satisfied: ok ?? false,
      note: ok ? 'מושב יחיד ✓' : 'יושב/ת ליד תלמיד/ה אחר/ת ✗',
    });
  }

  if (student.tags.includes('needs_wall')) {
    const ok = zones.has('near_wall');
    reasons.push({
      tag: '🧱 צריך/ה קיר',
      satisfied: ok,
      note: ok ? 'ליד קיר ✓' : 'לא ליד קיר ✗',
    });
  }

  if (student.tags.includes('distractible')) {
    const bad = zones.has('near_window') || zones.has('near_door');
    reasons.push({
      tag: '🌀 נוטה להסחה',
      satisfied: !bad,
      note: bad
        ? (zones.has('near_window') ? 'ליד חלון ✗' : 'ליד דלת ✗')
        : 'רחוק מחלון ודלת ✓',
    });
  }

  if (student.tags.includes('talkative')) {
    const deskId = seat?.deskId;
    const neighbor = deskId
      ? arr.assignments.find((a) => {
          if (a.studentId === studentId) return false;
          const ns = classroom.seats.find((s) => s.id === a.seatId);
          return ns?.deskId === deskId;
        })
      : null;
    const neighborStu = neighbor ? students.find((s) => s.id === neighbor.studentId) : null;
    const bad = neighborStu?.tags.includes('talkative') ?? false;
    reasons.push({
      tag: '💬 דברן/ית',
      satisfied: !bad,
      note: bad ? `יושב/ת ליד ${neighborStu!.name} (דברן/ית) ✗` : 'לא ליד דברן/ית אחר/ת ✓',
    });
  }

  if (student.avoidNear.length > 0) {
    const deskId = seat?.deskId;
    const neighbor = deskId
      ? arr.assignments.find((a) => {
          if (a.studentId === studentId) return false;
          const ns = classroom.seats.find((s) => s.id === a.seatId);
          return ns?.deskId === deskId;
        })
      : null;
    const neighborId = neighbor?.studentId;
    const bad = neighborId ? student.avoidNear.includes(neighborId) : false;
    if (bad) {
      const neighborName = students.find((s) => s.id === neighborId)?.name ?? '';
      reasons.push({
        tag: '🚫 הפרדה מתלמיד/ה',
        satisfied: false,
        note: `יושב/ת ליד ${neighborName} — לא מומלץ ✗`,
      });
    } else {
      reasons.push({
        tag: '🚫 הפרדה מתלמיד/ה',
        satisfied: true,
        note: 'מופרד/ת מתלמידים לא מומלצים ✓',
      });
    }
  }

  const allWarnings = validateAssignments(arr, classroom, students);
  const myWarnings = allWarnings.filter((w) => w.studentIds?.includes(studentId));

  if (seatId === null) {
    reasons.unshift({ tag: '⏳ בחנייה', satisfied: false, note: 'לא שובץ/ה עדיין' });
  }

  const f_prefix = f ? '' : '';
  void f_prefix; // suppress unused

  return { studentId, seatId, reasons, warnings: myWarnings };
}

export function getFullScore(
  arr: SeatingArrangement,
  classroom: Classroom,
  students: Student[]
): FullScore {
  const warnings = validateAssignments(arr, classroom, students);
  const score = scoreArrangement(warnings);
  const hardCount = warnings.filter((w) => w.type === 'hard').length;
  const softCount = warnings.filter((w) => w.type === 'soft').length;

  let summary: string;
  if (score === 100) summary = '✨ סידור מושלם — אין התראות';
  else if (score >= 80) summary = `👍 סידור טוב (${hardCount} חמורות, ${softCount} מומלצות)`;
  else if (score >= 60) summary = `⚠ סידור סביר (${hardCount} חמורות, ${softCount} מומלצות)`;
  else summary = `❌ סידור בעייתי (${hardCount} חמורות, ${softCount} מומלצות)`;

  return { score, warnings, hardCount, softCount, summary };
}
