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
}

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

// הוספת שולחן לטור — מוסיף בסוף (y מקסימלי + gap), מרווח אחיד
export function columnAddOp(group: DeskGroup): GridOperation {
  const { desks, gap, mainAxis } = group;
  const minY = desks[0].position.y;
  const ref = desks[0];

  const updates = desks.map((d, i) => ({
    id: d.id,
    position: { x: mainAxis, y: minY + i * gap },
  }));

  const add: Omit<Desk, 'id'> = {
    position: { x: mainAxis, y: minY + desks.length * gap },
    rotation: ref.rotation,
    seatCount: ref.seatCount,
    ...(ref.layoutGroup ? { layoutGroup: ref.layoutGroup } : {}),
  };

  return { updates, add };
}

// הסרת שולחן מטור — מסיר את האחרון (y מקסימלי), מרווח אחיד
export function columnRemoveOp(group: DeskGroup): GridOperation {
  const { desks, gap, mainAxis } = group;
  const removeId = desks[desks.length - 1].id;
  if (desks.length < 2) return { updates: [], removeId };
  const minY = desks[0].position.y;
  const remaining = desks.slice(0, -1);

  const updates = remaining.map((d, i) => ({
    id: d.id,
    position: { x: mainAxis, y: minY + i * gap },
  }));

  return { updates, removeId };
}

// הוספת שולחן לשורה — מוסיף בסוף (x מקסימלי + gap), מרווח אחיד
export function rowAddOp(group: DeskGroup): GridOperation {
  const { desks, gap, mainAxis } = group;
  const minX = desks[0].position.x;
  const ref = desks[0];

  const updates = desks.map((d, i) => ({
    id: d.id,
    position: { x: minX + i * gap, y: mainAxis },
  }));

  const add: Omit<Desk, 'id'> = {
    position: { x: minX + desks.length * gap, y: mainAxis },
    rotation: ref.rotation,
    seatCount: ref.seatCount,
    ...(ref.layoutGroup ? { layoutGroup: ref.layoutGroup } : {}),
  };

  return { updates, add };
}

// הסרת שולחן משורה — מסיר את האחרון (x מקסימלי), מרווח אחיד
export function rowRemoveOp(group: DeskGroup): GridOperation {
  const { desks, gap, mainAxis } = group;
  const removeId = desks[desks.length - 1].id;
  if (desks.length < 2) return { updates: [], removeId };
  const minX = desks[0].position.x;
  const remaining = desks.slice(0, -1);

  const updates = remaining.map((d, i) => ({
    id: d.id,
    position: { x: minX + i * gap, y: mainAxis },
  }));

  return { updates, removeId };
}
