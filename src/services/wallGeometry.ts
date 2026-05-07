// פונקציות גאומטריה לעבודה עם קירות:
// — חיתוך קיר קיים כדי להטמיע דלת/חלון בחלק ממנו
import type { Wall, WallType, Point, WallPoint } from '../types';

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: Math.round(a.x + t * (b.x - a.x)),
  y: Math.round(a.y + t * (b.y - a.y)),
});

interface ProjectionResult {
  distance: number;
  segIdx: number;
  t: number;          // פרמטר לאורך הקטע [0..1]
  point: Point;       // הנקודה המוקרנת
}

// הקרנת נקודה על קטע ישר [a→b]
function projectOntoSegment(p: Point, a: Point, b: Point): { t: number; point: Point; distance: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { t: 0, point: a, distance: dist(p, a) };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { t, point, distance: dist(p, point) };
}

// הקרנת נקודה על קיר (מוצא את הקטע הקרוב ביותר)
export function projectOntoWall(p: Point, wall: Wall): ProjectionResult {
  let best: ProjectionResult = { distance: Infinity, segIdx: -1, t: 0, point: p };
  for (let i = 0; i < wall.points.length - 1; i++) {
    const r = projectOntoSegment(p, wall.points[i], wall.points[i + 1]);
    if (r.distance < best.distance) {
      best = { distance: r.distance, segIdx: i, t: r.t, point: r.point };
    }
  }
  return best;
}

// סף מרחק (px) שמעליו לא נחשב "על הקיר"
const TOLERANCE = 30;

interface EmbedResult {
  removeWallId: string;
  newWalls: Omit<Wall, 'id'>[];
}

// מחפש קיר שעליו אפשר להטמיע את הדלת (לחיצה אחת)
// אם נמצא — מחזיר את ההוראות לחיתוך + יצירת 2-3 קירות חדשים.
// הדלת תהיה מיושרת לכיוון הקיר, באורך ~60px.
export function tryEmbedDoor(walls: Wall[], clickPoint: Point, doorLength = 60): EmbedResult | null {
  let bestWall: Wall | null = null;
  let bestProj: ProjectionResult | null = null;
  for (const wall of walls) {
    if (wall.type === 'door') continue;
    const proj = projectOntoWall(wall.points.length >= 2 ? clickPoint : clickPoint, wall);
    if (proj.distance > TOLERANCE) continue;
    if (!bestProj || proj.distance < bestProj.distance) {
      bestWall = wall;
      bestProj = proj;
    }
  }
  if (!bestWall || !bestProj) return null;

  const segStart = bestWall.points[bestProj.segIdx];
  const segEnd = bestWall.points[bestProj.segIdx + 1];
  const segLen = dist(segStart, segEnd);
  if (segLen < doorLength + 10) return null; // הקטע קצר מדי

  const half = (doorLength / 2) / segLen;
  let t1 = bestProj.t - half;
  let t2 = bestProj.t + half;
  if (t1 < 0) { t2 -= t1; t1 = 0; }
  if (t2 > 1) { t1 -= (t2 - 1); t2 = 1; }
  if (t1 < 0) t1 = 0;
  const p1 = lerp(segStart, segEnd, t1);
  const p2 = lerp(segStart, segEnd, t2);

  return buildSplit(bestWall, bestProj.segIdx, p1, p2, 'door');
}

// מטמיע segment 2-נקודתי בקיר קיים (חלון). שני הקצוות חייבים להיות באותו קטע.
export function tryEmbedSegment(
  walls: Wall[],
  newType: WallType,
  segPoints: Point[]
): EmbedResult | null {
  if (segPoints.length !== 2) return null;
  const [a, b] = segPoints;
  for (const wall of walls) {
    if (wall.type === newType) continue;
    const projA = projectOntoWall(a, wall);
    const projB = projectOntoWall(b, wall);
    if (projA.distance > TOLERANCE || projB.distance > TOLERANCE) continue;
    if (projA.segIdx !== projB.segIdx) continue;

    const segStart = wall.points[projA.segIdx];
    const segEnd = wall.points[projA.segIdx + 1];
    let t1 = Math.min(projA.t, projB.t);
    let t2 = Math.max(projA.t, projB.t);
    if (t2 - t1 < 0.02) continue;
    const p1 = lerp(segStart, segEnd, t1);
    const p2 = lerp(segStart, segEnd, t2);
    return buildSplit(wall, projA.segIdx, p1, p2, newType);
  }
  return null;
}

// בונה את הקירות החדשים אחרי החיתוך
function buildSplit(
  wall: Wall,
  segIdx: number,
  p1: Point,
  p2: Point,
  newType: WallType
): EmbedResult {
  const before: WallPoint[] = [...wall.points.slice(0, segIdx + 1), p1];
  const middle: WallPoint[] = [p1, p2];
  const after: WallPoint[] = [p2, ...wall.points.slice(segIdx + 1)];

  const newWalls: Omit<Wall, 'id'>[] = [];
  // קטע "לפני" — נשמר רק אם יש בו אורך משמעותי (>5px)
  if (before.length >= 2 && dist(before[before.length - 2], before[before.length - 1]) > 5) {
    newWalls.push({ type: wall.type, points: before });
  }
  newWalls.push({ type: newType, points: middle });
  if (after.length >= 2 && dist(after[0], after[1]) > 5) {
    newWalls.push({ type: wall.type, points: after });
  }
  return { removeWallId: wall.id, newWalls };
}
