// אלגוריתם יצירת סידור הושבה — מריץ מספר ניסיונות ובוחר את הטוב ביותר
import type {
  Classroom, Student, SeatingArrangement, SeatAssignment,
  GenerateArrangementOptions, Seat,
} from '../types';
import { computeAllAutoZones } from './zoneCalculator';
import { validateAssignments, scoreArrangement } from './seatingValidator';

const uid = () => Math.random().toString(36).slice(2, 10);

// ── גנרטור מספרים פסאודו-אקראיים (LCG) לתוצאות שחזוריות ──
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── ממשק ציבורי ──────────────────────────────────────────────────────────────

export function generateSeatingArrangement(
  classroom: Classroom,
  students: Student[],
  options: GenerateArrangementOptions = {}
): SeatingArrangement {
  if (!classroom.seats.length || !students.length) {
    return emptyArrangement(classroom.id);
  }

  // חשב zones מעודכנות לפי מבנה החדר
  const allZones = computeAllAutoZones(classroom);
  const enrichedSeats: Seat[] = classroom.seats.map((seat) => ({
    ...seat,
    autoZones: allZones.get(seat.id) ?? seat.autoZones,
  }));
  const enrichedClassroom: Classroom = { ...classroom, seats: enrichedSeats };

  const numCandidates = options.candidates ?? 60;
  const baseSeed = options.seed ?? Date.now();

  let best: SeatingArrangement | null = null;
  let bestScore = -1;

  for (let i = 0; i < numCandidates; i++) {
    const rng = makeRng(baseSeed + i * 7919);
    const candidate = buildCandidate(enrichedClassroom, students, rng, options);
    const warnings = validateAssignments(candidate, enrichedClassroom, students);
    const score = scoreArrangement(warnings);

    if (score > bestScore) {
      bestScore = score;
      best = { ...candidate, score, warnings };
    }
    if (bestScore === 100) break; // ציון מושלם — אין טעם להמשיך
  }

  return best ?? emptyArrangement(classroom.id);
}

// ── בניית מועמד יחיד ─────────────────────────────────────────────────────────

function buildCandidate(
  classroom: Classroom,
  students: Student[],
  rng: () => number,
  options: GenerateArrangementOptions
): SeatingArrangement {
  const seats = classroom.seats;
  const usedSeatIds = new Set<string>();
  const usedStudentIds = new Set<string>();
  const assignments: SeatAssignment[] = [];
  const parkedStudentIds: string[] = [];

  const assign = (seatId: string, studentId: string) => {
    if (usedSeatIds.has(seatId) || usedStudentIds.has(studentId)) return false;
    assignments.push({ seatId, studentId });
    usedSeatIds.add(seatId);
    usedStudentIds.add(studentId);
    return true;
  };

  const freeSeat = (predicate?: (s: Seat) => boolean) =>
    seats.find((s) => !usedSeatIds.has(s.id) && (!predicate || predicate(s)));

  const zones = (seat: Seat) => new Set([...(seat.autoZones ?? []), ...(seat.manualZones ?? [])]);

  // ── שלב 1: תלמידים עם needs_front → מושבים קדמיים ──
  const needsFront = shuffle(students.filter((s) => s.tags.includes('needs_front')), rng);
  const frontSeats = shuffle(seats.filter((s) => zones(s).has('front_row')), rng);
  let frontIdx = 0;
  for (const stu of needsFront) {
    while (frontIdx < frontSeats.length && usedSeatIds.has(frontSeats[frontIdx].id)) frontIdx++;
    const seat = frontSeats[frontIdx] ?? freeSeat(); // fallback לכל מושב
    if (seat) assign(seat.id, stu.id);
  }

  // ── שלב 2: גבוהים → מושבים אחוריים / צדדיים ──
  const tall = shuffle(
    students.filter((s) => s.tags.includes('tall') && !usedStudentIds.has(s.id)),
    rng
  );
  const backSeats = shuffle(
    seats.filter((s) => !usedSeatIds.has(s.id) && (zones(s).has('back_row') || zones(s).has('side_column'))),
    rng
  );
  let backIdx = 0;
  for (const stu of tall) {
    while (backIdx < backSeats.length && usedSeatIds.has(backSeats[backIdx].id)) backIdx++;
    const seat = backSeats[backIdx] ?? freeSeat((s) => !zones(s).has('front_row'));
    if (seat) assign(seat.id, stu.id);
  }

  // ── שלב 3: "כדאי שישב לבד" → מושבים solo ──
  const aloneStudents = shuffle(
    students.filter((s) => s.tags.includes('better_alone') && !usedStudentIds.has(s.id)),
    rng
  );
  const soloSeats = shuffle(seats.filter((s) => s.side === 'solo' && !usedSeatIds.has(s.id)), rng);
  let soloIdx = 0;
  for (const stu of aloneStudents) {
    while (soloIdx < soloSeats.length && usedSeatIds.has(soloSeats[soloIdx].id)) soloIdx++;
    if (soloSeats[soloIdx]) assign(soloSeats[soloIdx].id, stu.id);
    // לא מאלצים — אם אין solo seats, ישב זוגי
  }

  // ── שלב 4: צריך קיר → מושבים near_wall ──
  const wallStudents = shuffle(
    students.filter((s) => s.tags.includes('needs_wall') && !usedStudentIds.has(s.id)),
    rng
  );
  for (const stu of wallStudents) {
    const seat = freeSeat((s) => zones(s).has('near_wall'));
    if (seat) assign(seat.id, stu.id);
  }

  // ── שלב 5: זוגות preferredNear הדדיים → אותו שולחן זוגי ──
  const remaining = students.filter((s) => !usedStudentIds.has(s.id));
  const remainingSet = new Set(remaining.map((s) => s.id));
  const pairedIds = new Set<string>();

  // שולחנות זוגיים פנויים לחלוטין
  const freePairDesks = shuffle(
    classroom.desks.filter((d) => {
      if (d.seatCount !== 2) return false;
      const ds = seats.filter((s) => s.deskId === d.id);
      return ds.length === 2 && !usedSeatIds.has(ds[0].id) && !usedSeatIds.has(ds[1].id);
    }),
    rng
  );

  for (const stu of shuffle(remaining, rng)) {
    if (pairedIds.has(stu.id)) continue;
    for (const bId of stu.preferredNear) {
      if (!remainingSet.has(bId) || pairedIds.has(bId) || bId === stu.id) continue;
      const b = remaining.find((s) => s.id === bId);
      if (!b || stu.avoidNear.includes(b.id) || b.avoidNear.includes(stu.id)) continue;
      const desk = freePairDesks.find((d) => {
        const ds = seats.filter((s) => s.deskId === d.id);
        return !usedSeatIds.has(ds[0].id) && !usedSeatIds.has(ds[1].id);
      });
      if (!desk) break;
      const ds = seats.filter((s) => s.deskId === desk.id);
      assign(ds[0].id, stu.id);
      assign(ds[1].id, b.id);
      pairedIds.add(stu.id);
      pairedIds.add(b.id);
      break;
    }
  }

  // ── שלב 6: מילוי שאר התלמידים תוך הימנעות מ-avoidNear באותו שולחן ──
  const leftStudents = shuffle(students.filter((s) => !usedStudentIds.has(s.id)), rng);

  // מיפוי שולחן → תלמידים שכבר הושבו בו
  const deskOccupants = new Map<string, string[]>();
  for (const a of assignments) {
    const seat = seats.find((s) => s.id === a.seatId);
    if (!seat) continue;
    const cur = deskOccupants.get(seat.deskId) ?? [];
    deskOccupants.set(seat.deskId, [...cur, a.studentId]);
  }

  // מושבים פנויים, מעדיפים מושבים שבהם talkative/distractible לא ליד חלון/דלת
  let freeSeats = shuffle(seats.filter((s) => !usedSeatIds.has(s.id)), rng);

  for (const stu of leftStudents) {
    if (freeSeats.length === 0) { parkedStudentIds.push(stu.id); continue; }

    // מחפש מושב שמכבד avoidNear
    let chosen: Seat | undefined;

    for (const seat of freeSeats) {
      const occupants = deskOccupants.get(seat.deskId) ?? [];
      const conflict = occupants.some(
        (oid) =>
          stu.avoidNear.includes(oid) ||
          (students.find((s) => s.id === oid)?.avoidNear.includes(stu.id) ?? false)
      );
      // distractible: מעדיף לא ליד חלון/דלת
      const distractConflict =
        stu.tags.includes('distractible') &&
        (zones(seat).has('near_window') || zones(seat).has('near_door'));

      if (!conflict && !distractConflict) { chosen = seat; break; }
      if (!conflict && !chosen) chosen = seat; // fallback: ללא conflict, אבל עם הסחה
    }
    if (!chosen) chosen = freeSeats[0]; // worst-case

    freeSeats = freeSeats.filter((s) => s.id !== chosen!.id);
    assign(chosen.id, stu.id);
    const cur = deskOccupants.get(chosen.deskId) ?? [];
    deskOccupants.set(chosen.deskId, [...cur, stu.id]);
  }

  // ── שלב 7 (conservative mode): שמור תלמידים נעוצים ממקומם ──
  if (options.shuffleMode === 'conservative' && options.previousArrangement) {
    // החזר תלמידים שכבר היו במקום ולא עברו (אם המושב עדיין פנוי)
    // זה רק מגביל ה-shuffle ע"י seed שמור — לא ממש lock
    // TODO: implement proper lock of N% of students
  }

  return {
    id: uid(),
    name: '',
    classroomId: classroom.id,
    assignments,
    parkedStudentIds,
    score: 0,
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function emptyArrangement(classroomId: string): SeatingArrangement {
  return {
    id: uid(), name: '', classroomId,
    assignments: [], parkedStudentIds: [],
    score: 100, warnings: [],
    createdAt: new Date().toISOString(),
  };
}
