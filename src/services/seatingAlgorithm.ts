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
    const warnings = validateAssignments(candidate, enrichedClassroom, students, { separateGenders: options.separateGenders, mixGenders: options.mixGenders, forbiddenGroups: options.forbiddenGroups });
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

  // ── שלב 1א: needs_very_front → שורה קדמית ביותר בלבד ──
  const needsVeryFront = shuffle(students.filter((s) => s.tags.includes('needs_very_front')), rng);
  const veryFrontSeats = shuffle(seats.filter((s) => zones(s).has('front_row')), rng);
  let vfIdx = 0;
  for (const stu of needsVeryFront) {
    while (vfIdx < veryFrontSeats.length && usedSeatIds.has(veryFrontSeats[vfIdx].id)) vfIdx++;
    // fallback: שורה שנייה → אחר כך כל מושב, אבל כן מסמנים אזהרה
    const seat = veryFrontSeats[vfIdx]
      ?? freeSeat((s) => zones(s).has('second_row'))
      ?? freeSeat();
    if (seat) assign(seat.id, stu.id);
  }

  // ── שלב 1ב: needs_front → שורה 1 או 2 ──
  const needsFront = shuffle(
    students.filter((s) => s.tags.includes('needs_front') && !usedStudentIds.has(s.id)),
    rng
  );
  const frontTwoSeats = shuffle(
    seats.filter((s) => !usedSeatIds.has(s.id) && (zones(s).has('front_row') || zones(s).has('second_row'))),
    rng
  );
  let frontIdx = 0;
  for (const stu of needsFront) {
    while (frontIdx < frontTwoSeats.length && usedSeatIds.has(frontTwoSeats[frontIdx].id)) frontIdx++;
    const seat = frontTwoSeats[frontIdx] ?? freeSeat();
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

  // ── שלב 2ב: can_focus_back → עדיף שורה אחורית (לא חובה) ──
  const canFocusBack = shuffle(
    students.filter((s) => s.tags.includes('can_focus_back') && !usedStudentIds.has(s.id)),
    rng
  );
  const backOnlySeats = shuffle(
    seats.filter((s) => !usedSeatIds.has(s.id) && zones(s).has('back_row')),
    rng
  );
  let cbIdx = 0;
  for (const stu of canFocusBack) {
    while (cbIdx < backOnlySeats.length && usedSeatIds.has(backOnlySeats[cbIdx].id)) cbIdx++;
    if (backOnlySeats[cbIdx]) assign(backOnlySeats[cbIdx].id, stu.id);
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

  // ── שלב 5: VIP Match — שני תלמידי אחריות גבוהה (≥85) שלפחות אחד ביקש לשבת ליד השני ──
  // שוקל עדיפות עליונה לפני כל שאר הזוגות
  const remaining = students.filter((s) => !usedStudentIds.has(s.id));
  const remainingSet = new Set(remaining.map((s) => s.id));
  const pairedIds = new Set<string>();

  // שולחנות זוגיים פנויים לחלוטין
  const getPairDesks = () =>
    classroom.desks.filter((d) => {
      if (d.seatCount !== 2) return false;
      const ds = seats.filter((s) => s.deskId === d.id);
      return ds.length === 2 && !usedSeatIds.has(ds[0].id) && !usedSeatIds.has(ds[1].id);
    });

  // VIP: שניהם אחריות גבוהה ולפחות אחד מבקש לשבת ליד השני
  const highResp = remaining.filter((s) => s.responsibilityScore >= 85);
  for (const a of highResp) {
    if (pairedIds.has(a.id)) continue;
    for (const b of highResp) {
      if (b.id === a.id || pairedIds.has(b.id)) continue;
      const aWantsB = a.preferredNear.includes(b.id);
      const bWantsA = b.preferredNear.includes(a.id);
      if (!(aWantsB || bWantsA)) continue;
      if (a.avoidNear.includes(b.id) || b.avoidNear.includes(a.id)) continue;
      const desk = getPairDesks()[0];
      if (!desk) break;
      const ds = seats.filter((s) => s.deskId === desk.id);
      assign(ds[0].id, a.id); assign(ds[1].id, b.id);
      pairedIds.add(a.id); pairedIds.add(b.id);
      break;
    }
  }

  // שלב 5ב: זוגות preferredNear הדדיים רגילים → אותו שולחן זוגי
  for (const stu of shuffle(remaining, rng)) {
    if (pairedIds.has(stu.id) || usedStudentIds.has(stu.id)) continue;
    for (const bId of stu.preferredNear) {
      if (!remainingSet.has(bId) || pairedIds.has(bId) || usedStudentIds.has(bId) || bId === stu.id) continue;
      const b = remaining.find((s) => s.id === bId);
      if (!b || stu.avoidNear.includes(b.id) || b.avoidNear.includes(stu.id)) continue;
      const desk = getPairDesks()[0];
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

    // עזר: בדיקת שכנות שולחנות לצורך שילובים אסורים
    const deskById = new Map(classroom.desks.map((d) => [d.id, d]));
    const areNeighborDesks = (dA: string, dB: string) => {
      if (dA === dB) return true;
      const a = deskById.get(dA);
      const b = deskById.get(dB);
      if (!a || !b) return false;
      const dx = a.position.x - b.position.x;
      const dy = a.position.y - b.position.y;
      return dx * dx + dy * dy < 240 * 240;
    };

    for (const seat of freeSeats) {
      const occupants = deskOccupants.get(seat.deskId) ?? [];
      const conflict = occupants.some(
        (oid) =>
          stu.avoidNear.includes(oid) ||
          (students.find((s) => s.id === oid)?.avoidNear.includes(stu.id) ?? false)
      );

      // שילובים אסורים — לא באותו שולחן ולא בשולחן שכן
      const forbiddenConflict = options.forbiddenGroups?.some((group) => {
        const gs = new Set(group);
        if (!gs.has(stu.id)) return false;
        // בדוק את כל השולחנות השכנים
        for (const [deskId, occs] of deskOccupants) {
          if (!areNeighborDesks(seat.deskId, deskId)) continue;
          if (occs.some((oid) => gs.has(oid))) return true;
        }
        return false;
      }) ?? false;

      // distractible: מעדיף לא ליד חלון/דלת
      const distractConflict =
        stu.tags.includes('distractible') &&
        (zones(seat).has('near_window') || zones(seat).has('near_door'));

      // הפרדת/ערבוב מגדרים
      const deskOccs = deskOccupants.get(seat.deskId) ?? [];
      const genderConflict = (() => {
        if (!stu.gender) return false;
        if (options.separateGenders) {
          return deskOccs.some((oid) => {
            const ostu = students.find((s) => s.id === oid);
            return ostu?.gender && ostu.gender !== stu.gender;
          });
        }
        if (options.mixGenders) {
          return deskOccs.some((oid) => {
            const ostu = students.find((s) => s.id === oid);
            return ostu?.gender && ostu.gender === stu.gender;
          });
        }
        return false;
      })();

      if (!conflict && !forbiddenConflict && !distractConflict && !genderConflict) { chosen = seat; break; }
      if (!conflict && !forbiddenConflict && !distractConflict && !chosen) chosen = seat;
    }
    if (!chosen) chosen = freeSeats[0]; // worst-case

    freeSeats = freeSeats.filter((s) => s.id !== chosen!.id);
    assign(chosen.id, stu.id);
    const cur = deskOccupants.get(chosen.deskId) ?? [];
    deskOccupants.set(chosen.deskId, [...cur, stu.id]);
  }

  // ── שלב 7: הפרדת דברנים — לא שני דברנים באותו שולחן ──
  const seatToStudentId = new Map<string, string>(assignments.map((a) => [a.seatId, a.studentId]));
  const studentIdToSeatId = new Map<string, string>(assignments.map((a) => [a.studentId, a.seatId]));

  for (const desk of classroom.desks) {
    if (desk.seatCount !== 2) continue;
    const ds = seats.filter((s) => s.deskId === desk.id);
    if (ds.length < 2) continue;
    const idA = seatToStudentId.get(ds[0].id);
    const idB = seatToStudentId.get(ds[1].id);
    if (!idA || !idB) continue;
    const stuA = students.find((s) => s.id === idA);
    const stuB = students.find((s) => s.id === idB);
    if (!stuA?.tags.includes('talkative') || !stuB?.tags.includes('talkative')) continue;
    // שני דברנים באותו שולחן — החלף את stuB עם תלמיד שאינו דברן בשולחן אחר
    const swapTarget = assignments.find((a) => {
      const s = students.find((x) => x.id === a.studentId);
      if (!s || s.tags.includes('talkative') || s.id === idA || s.id === idB) return false;
      const targetSeat = seats.find((x) => x.id === a.seatId);
      if (!targetSeat || targetSeat.deskId === desk.id) return false;
      // לא תלמיד עם needs_front / better_alone
      if (s.tags.includes('needs_front') || s.tags.includes('better_alone')) return false;
      return true;
    });
    if (!swapTarget) continue;
    // החלף
    const swapSeatId = swapTarget.seatId;
    const swapStudentId = swapTarget.studentId;
    const bSeatId = studentIdToSeatId.get(idB)!;
    swapTarget.seatId = bSeatId;
    const bAssign = assignments.find((a) => a.studentId === idB);
    if (bAssign) bAssign.seatId = swapSeatId;
    seatToStudentId.set(bSeatId, swapStudentId);
    seatToStudentId.set(swapSeatId, idB);
    studentIdToSeatId.set(swapStudentId, bSeatId);
    studentIdToSeatId.set(idB, swapSeatId);
  }

  // ── שלב 8: אזור שקט — דברנים לא ליד תלמידי אחריות גבוהה (≥85) ──
  for (const desk of classroom.desks) {
    if (desk.seatCount !== 2) continue;
    const ds = seats.filter((s) => s.deskId === desk.id);
    if (ds.length < 2) continue;
    const idA = seatToStudentId.get(ds[0].id);
    const idB = seatToStudentId.get(ds[1].id);
    if (!idA || !idB) continue;
    const stuA = students.find((s) => s.id === idA);
    const stuB = students.find((s) => s.id === idB);
    if (!stuA || !stuB) continue;
    const talker = stuA.tags.includes('talkative') ? stuA : stuB.tags.includes('talkative') ? stuB : null;
    const highR = (stuA.responsibilityScore ?? 70) >= 85 ? stuA : (stuB.responsibilityScore ?? 70) >= 85 ? stuB : null;
    if (!talker || !highR) continue;
    // דברן ליד תלמיד אחריות גבוהה — החלף את הדברן
    const swapTarget = assignments.find((a) => {
      const s = students.find((x) => x.id === a.studentId);
      if (!s || s.tags.includes('talkative') || s.id === talker.id || s.id === highR.id) return false;
      const targetSeat = seats.find((x) => x.id === a.seatId);
      if (!targetSeat || targetSeat.deskId === desk.id) return false;
      if (s.tags.includes('needs_front') || s.tags.includes('better_alone')) return false;
      if ((s.responsibilityScore ?? 70) >= 85) return false;
      return true;
    });
    if (!swapTarget) continue;
    const talkerSeatId = studentIdToSeatId.get(talker.id)!;
    const swapSeatId = swapTarget.seatId;
    const swapStudentId = swapTarget.studentId;
    swapTarget.seatId = talkerSeatId;
    const talkerAssign = assignments.find((a) => a.studentId === talker.id);
    if (talkerAssign) talkerAssign.seatId = swapSeatId;
    seatToStudentId.set(talkerSeatId, swapStudentId);
    seatToStudentId.set(swapSeatId, talker.id);
    studentIdToSeatId.set(swapStudentId, talkerSeatId);
    studentIdToSeatId.set(talker.id, swapSeatId);
  }

  // ── שלב 9 (conservative mode): שמור תלמידים נעוצים ממקומם ──
  if (options.shuffleMode === 'conservative' && options.previousArrangement) {
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
