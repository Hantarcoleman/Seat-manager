// תבניות מוכנות של כיתה — מייצר רשימת קירות/שולחנות מוכנה
import type { Wall, Desk, Seat, FixedElement } from '../types';

export interface TemplateOutput {
  walls: Omit<Wall, 'id'>[];
  desks: { desk: Omit<Desk, 'id'>; seats: Omit<Seat, 'id' | 'deskId'>[] }[];
  fixedElements: Omit<FixedElement, 'id'>[];
}

// כיתה גנרית: חדר מלבני עם לוח על הקיר התחתון, ומערך שולחנות זוגיים בגריד
export function buildGenericClassroom(rows: number, cols: number, canvasWidth: number, canvasHeight: number): TemplateOutput {
  const padding = 70; // שוליים פנימיים
  const x1 = padding;
  const y1 = padding;
  const x2 = canvasWidth - padding;
  const y2 = canvasHeight - padding;

  const walls: Omit<Wall, 'id'>[] = [
    // עליון — קיר אטום
    { type: 'blank', points: [{ x: x1, y: y1 }, { x: x2, y: y1 }] },
    // ימני
    { type: 'blank', points: [{ x: x2, y: y1 }, { x: x2, y: y2 }] },
    // שמאלי
    { type: 'blank', points: [{ x: x1, y: y2 }, { x: x1, y: y1 }] },
    // תחתון — לוח (כל הרוחב)
    { type: 'board', points: [{ x: x1, y: y2 }, { x: x2, y: y2 }] },
  ];

  // שולחן מורה ליד הלוח
  const fixedElements: Omit<FixedElement, 'id'>[] = [
    {
      type: 'teacher_desk_single',
      position: { x: (x1 + x2) / 2, y: y2 - 70 },
      rotation: 0,
      width: 130,
      height: 60,
    },
  ];

  // גריד שולחנות זוגיים
  const desks: TemplateOutput['desks'] = [];
  // מקום פנוי בתוך החדר לשולחנות
  const usableTop = y1 + 60;
  const usableBottom = y2 - 150; // מקום ללוח+שולחן מורה
  const usableLeft = x1 + 60;
  const usableRight = x2 - 60;
  const usableW = usableRight - usableLeft;
  const usableH = usableBottom - usableTop;

  // כל מקום ב-grid יקבל שולחן זוגי
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = usableLeft + (cols === 1 ? usableW / 2 : (usableW * c) / (cols - 1));
      const cy = usableTop  + (rows === 1 ? usableH / 2 : (usableH * r) / (rows - 1));
      desks.push({
        desk: {
          position: { x: Math.round(cx), y: Math.round(cy) },
          rotation: 0,
          seatCount: 2,
          layoutGroup: 'generic',
        },
        seats: [
          { side: 'left',  autoZones: [] },
          { side: 'right', autoZones: [] },
        ],
      });
    }
  }

  return { walls, desks, fixedElements };
}
