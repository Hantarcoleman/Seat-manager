// זיהוי טורים ושורות של שולחנות וחישוב פעולות הוספה/הסרה
import type { Desk } from '../types';

export interface DeskGroup {
  mainAxis: number;   // x לטורים, y לשורות
  gap: number;        // מרווח חציוני בין שולחנות
  desks: Desk[];      // ממוינים לפי הציר המשני
}

export interface GridOperation {
  updates: { id: string; position: { x: number; y: number } }[];
  add?: Omit<Desk, 'id'>;
  removeId?: string;
  refused?: boolean;  // אין מקום — הפעולה נדחתה
}

export interface ClassroomBounds {
  width: number;
  height: number;
}

// שוליים מינימליים מקצה הכיתה למרכז שולחן (px) — 95 מכסה שולחן זוגי (חצי-רוחב 88px)
const DESK_MARGIN = 95;
// מרווח מינימלי בין שולחנות — לא נדחס מתחת לזה
const MIN_GAP = 60;

const TOLERANCE = 50;

// קיבוץ לפי ציר X → טורים אנכיים
export function detectColumns(desks: Desk[], tolerance = TOLERANCE): DeskGroup[] {
  return detectGroups(desks, 'x', 'y', tolerance);
}

// קיבוץ לפי ציר Y → שורות אופקיות
export function detectRows(desks: Desk[], tolerance = TOLERANCE): DeskGroup[] {
  return detectGroups(desks, 'y', 'x', tolerance);
}

function detectGroups(
  desks: Desk[],
  mainKey: 'x' | 'y',
  secKey: 'x' | 'y',
  tolerance: number,
): DeskGroup[] {
  if (desks.length === 0) return [];

  const sorted = [...desks].sort((a, b) => a.position[mainKey] - b.position[mainKey]);
  const groups: { items: Desk[]; sum: number }[] = [];

  for (const desk of sorted) {
    const val = desk.position[mainKey];
    const found = groups.find((g) => Math.abs(g.sum / g.items.length - val) < tolerance);
    if (found) {
      found.items.push(desk);
      found.sum += val;
    } else {
      groups.push({ items: [desk], sum: val });
    }
  }

  return groups
    .filter((g) => g.items.length >= 2)
    .map((g) => {
      const itemsSorted = [...g.items].sort((a, b) => a.position[secKey] - b.position[secKey]);
      return {
        mainAxis: Math.round(g.sum / g.items.length),
        gap: calcMedianGap(itemsSorted, secKey),
        desks: itemsSorted,
      };
    });
}

function calcMedianGap(desks: Desk[], axis: 'x' | 'y'): number {
  if (desks.length < 2) return 100;
  const gaps: number[] = [];
  for (let i = 1; i < desks.length; i++) {
    gaps.push(desks[i].position[axis] - desks[i - 1].position[axis]);
  }
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

// הוספת שולחן לטור — מוסיף בסוף, מרווח אחיד. אם אין מקום — מכווץ פערים.
export function columnAddOp(group: DeskGroup, bounds: ClassroomBounds): GridOperation {
  const { desks, mainAxis } = group;
  const n = desks.length;
  const minY = desks[0].position.y;
  const ref = desks[0];
  const maxY = bounds.height - DESK_MARGIN;

  // חשב gap שמתאים ל-n+1 שולחנות בתוך הגבול
  let gap = group.gap;
  if (minY + n * gap > maxY) {
    gap = (maxY - minY) / n;
    if (gap < MIN_GAP) return { updates: [], refused: true };
  }

  const updates = desks.map((d, i) => ({
    id: d.id,
    position: { x: mainAxis, y: Math.round(minY + i * gap) },
  }));

  const add: Omit<Desk, 'id'> = {
    position: { x: mainAxis, y: Math.round(minY + n * gap) },
    rotation: ref.rotation,
    seatCount: ref.seatCount,
    ...(ref.layoutGroup ? { layoutGroup: ref.layoutGroup } : {}),
  };

  return { updates, add };
}

// הסרת שולחן מטור — מסיר את האחרון (y מקסימלי), מפזר את הנותרים שווה-שווה
export function columnRemoveOp(group: DeskGroup, bounds: ClassroomBounds): GridOperation {
  const { desks, mainAxis } = group;
  const removeId = desks[desks.length - 1].id;
  if (desks.length < 2) return { updates: [], removeId };
  const remaining = desks.slice(0, -1);

  // ריווח שווה בטווח שהנותרים תופסים (ראשון עד אחרון של remaining)
  const minY = remaining[0].position.y;
  const maxRemainingY = remaining[remaining.length - 1].position.y;
  const span = maxRemainingY - minY;
  const evenGap = remaining.length >= 2 ? Math.round(span / (remaining.length - 1)) : 0;

  const updates = remaining.map((d, i) => ({
    id: d.id,
    position: { x: mainAxis, y: Math.round(minY + i * evenGap) },
  }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void bounds;
  return { updates, removeId };
}

// הוספת שולחן לשורה — מוסיף בסוף, מרווח אחיד. אם אין מקום — מכווץ פערים.
export function rowAddOp(group: DeskGroup, bounds: ClassroomBounds): GridOperation {
  const { desks, mainAxis } = group;
  const n = desks.length;
  const minX = desks[0].position.x;
  const ref = desks[0];
  const maxX = bounds.width - DESK_MARGIN;

  let gap = group.gap;
  if (minX + n * gap > maxX) {
    gap = (maxX - minX) / n;
    if (gap < MIN_GAP) return { updates: [], refused: true };
  }

  const updates = desks.map((d, i) => ({
    id: d.id,
    position: { x: Math.round(minX + i * gap), y: mainAxis },
  }));

  const add: Omit<Desk, 'id'> = {
    position: { x: Math.round(minX + n * gap), y: mainAxis },
    rotation: ref.rotation,
    seatCount: ref.seatCount,
    ...(ref.layoutGroup ? { layoutGroup: ref.layoutGroup } : {}),
  };

  return { updates, add };
}

// הסרת שולחן משורה — מסיר את האחרון (x מקסימלי), מפזר את הנותרים שווה-שווה
export function rowRemoveOp(group: DeskGroup, bounds: ClassroomBounds): GridOperation {
  const { desks, mainAxis } = group;
  const removeId = desks[desks.length - 1].id;
  if (desks.length < 2) return { updates: [], removeId };
  const remaining = desks.slice(0, -1);

  const minX = remaining[0].position.x;
  const maxRemainingX = remaining[remaining.length - 1].position.x;
  const span = maxRemainingX - minX;
  const evenGap = remaining.length >= 2 ? Math.round(span / (remaining.length - 1)) : 0;

  const updates = remaining.map((d, i) => ({
    id: d.id,
    position: { x: Math.round(minX + i * evenGap), y: mainAxis },
  }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void bounds;
  return { updates, removeId };
}
