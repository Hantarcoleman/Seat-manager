// בדיקת אילוצים בסידור הושבה - מחזיר התראות לפי כללי הפדגוגיה
import type { Classroom, Student, SeatingArrangement, ArrangementWarning } from '../types';

// תווית עם פנייה מותאמת מין
const lui = (s: Student) => s.name; // alias

export function validateAssignments(
  arr: SeatingArrangement,
  classroom: Classroom,
  students: Student[],
  opts?: { separateGenders?: boolean }
): ArrangementWarning[] {
  const warnings: ArrangementWarning[] = [];

  const seatToStudent = new Map<string, Student>();
  for (const a of arr.assignments) {
    const stu = students.find((s) => s.id === a.studentId);
    if (stu) seatToStudent.set(a.seatId, stu);
  }

  // ── אילוצים פר-מושב ───────────────────────────
  for (const [seatId, stu] of seatToStudent) {
    const seat = classroom.seats.find((s) => s.id === seatId);
    if (!seat) continue;
    const zones = new Set([...(seat.autoZones ?? []), ...(seat.manualZones ?? [])]);
    const f = stu.gender === 'f';

    // גבוה/ה בקדמת הכיתה
    if (stu.tags.includes('tall') && zones.has('front_row')) {
      warnings.push({
        type: 'soft',
        message: f
          ? `📏 ${lui(stu)} (גבוהה) יושבת בקדמת הכיתה — עלולה להסתיר את הראייה. עדיף בצדדים או מאחור.`
          : `📏 ${lui(stu)} (גבוה) יושב בקדמת הכיתה — עלול להסתיר את הראייה. עדיף בצדדים או מאחור.`,
        studentIds: [stu.id], seatIds: [seat.id],
      });
    }

    // נוטה להסחה ליד חלון/דלת
    if (stu.tags.includes('distractible')) {
      if (zones.has('near_window')) {
        warnings.push({
          type: 'soft',
          message: f
            ? `🌀 ${lui(stu)} (נוטה להסחה) יושבת ליד חלון`
            : `🌀 ${lui(stu)} (נוטה להסחה) יושב ליד חלון`,
          studentIds: [stu.id], seatIds: [seat.id],
        });
      }
      if (zones.has('near_door')) {
        warnings.push({
          type: 'soft',
          message: f
            ? `🌀 ${lui(stu)} (נוטה להסחה) יושבת ליד דלת`
            : `🌀 ${lui(stu)} (נוטה להסחה) יושב ליד דלת`,
          studentIds: [stu.id], seatIds: [seat.id],
        });
      }
    }

    // צריך/ה קיר אך לא יושב/ת ליד קיר
    if (stu.tags.includes('needs_wall') && !zones.has('near_wall')) {
      warnings.push({
        type: 'soft',
        message: f
          ? `🧱 ${lui(stu)} (צריכה קיר) — לא יושבת ליד קיר`
          : `🧱 ${lui(stu)} (צריך קיר) — לא יושב ליד קיר`,
        studentIds: [stu.id], seatIds: [seat.id],
      });
    }

    // חייב/ת שורה קדמית ביותר — רק שורה 1
    if (stu.tags.includes('needs_very_front') && !zones.has('front_row')) {
      warnings.push({
        type: 'hard',
        message: f
          ? `🔴 ${lui(stu)} חייבת לשבת בשורה הקדמית ביותר — לא יושבת שם!`
          : `🔴 ${lui(stu)} חייב לשבת בשורה הקדמית ביותר — לא יושב שם!`,
        studentIds: [stu.id], seatIds: [seat.id],
      });
    }

    // חייב/ת אחת משתי השורות הקדמיות — שורה 1 או 2
    if (stu.tags.includes('needs_front') && !zones.has('front_row') && !zones.has('second_row')) {
      warnings.push({
        type: 'hard',
        message: f
          ? `👓 ${lui(stu)} חייבת לשבת באחת משתי השורות הקדמיות — לא יושבת שם!`
          : `👓 ${lui(stu)} חייב לשבת באחת משתי השורות הקדמיות — לא יושב שם!`,
        studentIds: [stu.id], seatIds: [seat.id],
      });
    }

    // המלצה: "כדאי שישב/תשב לבד" — מזהיר רק אם המושב הצמוד בשולחן תפוס
    if (stu.tags.includes('better_alone') && seat.side !== 'solo') {
      const deskSeats = classroom.seats.filter((s) => s.deskId === seat.deskId && s.id !== seatId);
      const neighborOccupied = deskSeats.some((ds) => seatToStudent.has(ds.id));
      if (neighborOccupied) {
        warnings.push({
          type: 'soft',
          message: f
            ? `⭐ ${lui(stu)} כדאי שתשב לבד — יושבת ליד תלמיד/ה אחר/ת`
            : `⭐ ${lui(stu)} כדאי שישב לבד — יושב ליד תלמיד/ה אחר/ת`,
          studentIds: [stu.id], seatIds: [seat.id],
        });
      }
    }
  }

  // ── אילוצי שולחן זוגי ──────────────────────────
  for (const desk of classroom.desks) {
    if (desk.seatCount !== 2) continue;
    const seats = classroom.seats.filter((s) => s.deskId === desk.id);
    if (seats.length !== 2) continue;
    const a = seatToStudent.get(seats[0].id);
    const b = seatToStudent.get(seats[1].id);
    if (!a || !b) continue;

    if (a.avoidNear.includes(b.id) || b.avoidNear.includes(a.id)) {
      warnings.push({
        type: 'hard',
        message: `🚫 ${a.name} ו-${b.name} יושבים יחד למרות סימון "לא מומלץ ליד"`,
        studentIds: [a.id, b.id], seatIds: [seats[0].id, seats[1].id],
      });
    }

    if (a.tags.includes('talkative') && b.tags.includes('talkative')) {
      warnings.push({
        type: 'soft',
        message: `💬 שני דברנים יושבים יחד: ${a.name} ו-${b.name}`,
        studentIds: [a.id, b.id], seatIds: [seats[0].id, seats[1].id],
      });
    }

    // הגנה על אזור שקט: תלמיד/ה עם 100% אחריות ליד דברן/ית
    if (a.responsibilityScore >= 100 && b.tags.includes('talkative')) {
      warnings.push({
        type: 'soft',
        message: `✨ ${a.name} (100% אחריות) יושב/ת ליד ${b.name} (דברן/ית)`,
        studentIds: [a.id, b.id], seatIds: [seats[0].id, seats[1].id],
      });
    }
    if (b.responsibilityScore >= 100 && a.tags.includes('talkative')) {
      warnings.push({
        type: 'soft',
        message: `✨ ${b.name} (100% אחריות) יושב/ת ליד ${a.name} (דברן/ית)`,
        studentIds: [a.id, b.id], seatIds: [seats[0].id, seats[1].id],
      });
    }

    if (opts?.separateGenders && a.gender && b.gender && a.gender !== b.gender) {
      warnings.push({
        type: 'soft',
        message: `⚡ ${a.name} ו-${b.name} יושבים יחד (בנים/בנות מעורבים)`,
        studentIds: [a.id, b.id], seatIds: [seats[0].id, seats[1].id],
      });
    }
  }

  return warnings;
}

// ניקוד כללי
export function scoreArrangement(warnings: ArrangementWarning[]): number {
  let score = 100;
  for (const w of warnings) {
    if (w.type === 'hard') score -= 12;
    else if (w.type === 'soft') score -= 5;
  }
  return Math.max(0, score);
}
