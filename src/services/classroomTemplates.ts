// תבניות מוכנות של כיתה — מייצר רשימת קירות/שולחנות מוכנה
import type { Wall, Desk, Seat, FixedElement } from '../types';

export interface TemplateOutput {
  walls: Omit<Wall, 'id'>[];
  desks: { desk: Omit<Desk, 'id'>; seats: Omit<Seat, 'id' | 'deskId'>[] }[];
  fixedElements: Omit<FixedElement, 'id'>[];
}

// מידות שולחן זוגי (חייבות להיות מסונכרנות עם DeskLayoutEditor)
const PAIR_W = 130;
const PAIR_H = 70;
const TEACHER_W = 130;
const TEACHER_H = 60;

// כיתה גנרית: חדר מלבני עם לוח על הקיר התחתון, שולחן מורה ליד הלוח,
// וגריד שולחנות זוגיים פרוס באופן אחיד **בתוך** הקירות.
export function buildGenericClassroom(rows: number, cols: number, canvasWidth: number, canvasHeight: number): TemplateOutput {
  const padding = 70; // מרווח של החדר מקצה הקנבס
  const x1 = padding;
  const y1 = padding;
  const x2 = canvasWidth - padding;
  const y2 = canvasHeight - padding;

  const walls: Omit<Wall, 'id'>[] = [
    { type: 'blank', points: [{ x: x1, y: y1 }, { x: x2, y: y1 }] },          // עליון
    { type: 'blank', points: [{ x: x2, y: y1 }, { x: x2, y: y2 }] },          // ימני
    { type: 'blank', points: [{ x: x1, y: y2 }, { x: x1, y: y1 }] },          // שמאלי
    { type: 'board', points: [{ x: x1, y: y2 }, { x: x2, y: y2 }] },          // תחתון = לוח
  ];

  // שולחן מורה ליד הלוח, בלי לחרוג ממנו
  const teacherCenterY = y2 - TEACHER_H / 2 - 15;
  const fixedElements: Omit<FixedElement, 'id'>[] = [
    {
      type: 'teacher_desk_single',
      position: { x: Math.round((x1 + x2) / 2), y: Math.round(teacherCenterY) },
      rotation: 0,
      width: TEACHER_W,
      height: TEACHER_H,
    },
  ];

  // אזור שמיש לשולחנות — מבטיח שהשולחנות (130x70) לא חורגים מהקירות
  const INNER_MARGIN = 25;                    // מרחק שולחן מקיר
  const TEACHER_CLEARANCE = TEACHER_H + 30;   // מקום לשולחן המורה+מעט

  const usableLeft   = x1 + PAIR_W / 2 + INNER_MARGIN;
  const usableRight  = x2 - PAIR_W / 2 - INNER_MARGIN;
  const usableTop    = y1 + PAIR_H / 2 + INNER_MARGIN;
  const usableBottom = y2 - PAIR_H / 2 - TEACHER_CLEARANCE;
  const usableW = Math.max(0, usableRight - usableLeft);
  const usableH = Math.max(0, usableBottom - usableTop);

  const desks: TemplateOutput['desks'] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = cols === 1
        ? (usableLeft + usableRight) / 2
        : usableLeft + (usableW * c) / (cols - 1);
      const cy = rows === 1
        ? (usableTop + usableBottom) / 2
        : usableTop  + (usableH * r) / (rows - 1);
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
