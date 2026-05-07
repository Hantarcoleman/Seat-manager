// חישוב אזורי קרבה (zones) לכל מושב לפי מיקומו ביחס לקירות
import type { Classroom, Desk, Seat, Wall, ZoneTag, Point } from '../types';

const NEAR_THRESHOLD = 110; // פיקסלים — קרבה לקיר

// מרחק מנקודה לקטע (a→b)
function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

// מרחק מנקודה לקיר (פוליליין)
function distanceToWall(p: Point, wall: Wall): number {
  if (wall.points.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < wall.points.length - 1; i++) {
    const d = distancePointToSegment(p, wall.points[i], wall.points[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

// מיקום אבסולוטי של מושב (מתחשב בסיבוב של השולחן)
export function getSeatPosition(desk: Desk, seat: Seat): Point {
  if (seat.side === 'solo') return { ...desk.position };
  const offset = seat.side === 'left' ? -25 : 25;
  const r = (desk.rotation * Math.PI) / 180;
  return {
    x: desk.position.x + offset * Math.cos(r),
    y: desk.position.y + offset * Math.sin(r),
  };
}

// חישוב אזורי קרבה של מושב יחיד
export function computeProximityZones(p: Point, walls: Wall[]): ZoneTag[] {
  const zones: ZoneTag[] = [];
  let minDoor = Infinity;
  let minWindow = Infinity;
  let minWall = Infinity;

  for (const wall of walls) {
    const d = distanceToWall(p, wall);
    if (wall.type === 'door') minDoor = Math.min(minDoor, d);
    else if (wall.type === 'window_lobby' || wall.type === 'window_yard' || wall.type === 'small_window') {
      minWindow = Math.min(minWindow, d);
    } else if (wall.type === 'blank') {
      minWall = Math.min(minWall, d);
    }
  }

  if (minDoor < NEAR_THRESHOLD) zones.push('near_door');
  if (minWindow < NEAR_THRESHOLD) zones.push('near_window');
  if (minWall < NEAR_THRESHOLD) zones.push('near_wall');
  return zones;
}

// חישוב אזורי front_row / back_row — דורש את כל המושבים יחד
// front = שליש הקרוב ביותר ללוח, back = שליש הרחוק ביותר
export function classifyFrontBack(
  seatsWithPos: { seatId: string; pos: Point }[],
  walls: Wall[]
): Record<string, ZoneTag[]> {
  const result: Record<string, ZoneTag[]> = {};
  const board = walls.find((w) => w.type === 'board');
  if (!board) return result;

  const dists = seatsWithPos.map(({ seatId, pos }) => ({ seatId, d: distanceToWall(pos, board) }));
  dists.sort((a, b) => a.d - b.d);
  const n = dists.length;
  if (n === 0) return result;
  const frontCount = Math.max(1, Math.floor(n / 3));
  const backStart = Math.max(frontCount, n - frontCount);

  dists.forEach((entry, i) => {
    if (i < frontCount) result[entry.seatId] = ['front_row'];
    else if (i >= backStart) result[entry.seatId] = ['back_row'];
    else result[entry.seatId] = [];
  });
  return result;
}

// חישוב מלא של כל ה-autoZones לכל המושבים
export function computeAllAutoZones(classroom: Classroom): Map<string, ZoneTag[]> {
  const map = new Map<string, ZoneTag[]>();
  const seatsWithPos = classroom.seats
    .map((seat) => {
      const desk = classroom.desks.find((d) => d.id === seat.deskId);
      if (!desk) return null;
      return { seat, pos: getSeatPosition(desk, seat) };
    })
    .filter(<T,>(x: T | null): x is T => x !== null);

  // קרבה לקירות
  for (const { seat, pos } of seatsWithPos) {
    map.set(seat.id, computeProximityZones(pos, classroom.walls));
  }

  // front/back
  const fb = classifyFrontBack(
    seatsWithPos.map(({ seat, pos }) => ({ seatId: seat.id, pos })),
    classroom.walls
  );
  for (const [seatId, zones] of Object.entries(fb)) {
    const cur = map.get(seatId) ?? [];
    map.set(seatId, [...cur, ...zones]);
  }

  return map;
}
