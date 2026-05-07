// טיפוסים מרכזיים — אפליקציית סידור הושבה לכיתה

// ── גאומטריה בסיסית ────────────────────────────────────────
export interface Point {
  x: number;
  y: number;
}

// נקודה בקיר. אם control מוגדר — הנקודה היא נקודת קצה של עקומת בזייה
// עם control כנקודת בקרה.
export interface WallPoint extends Point {
  control?: Point;
}

// ── קירות וצורת החדר ──────────────────────────────────────
export type WallType =
  | 'blank'         // קיר אטום
  | 'window_lobby'  // חלון ללובי / מסדרון
  | 'window_yard'   // חלון לחצר בית הספר
  | 'small_window'  // חלון קטן (לרוב על קיר בטון)
  | 'door'          // דלת כניסה
  | 'board';        // לוח

export interface Wall {
  id: string;
  type: WallType;
  // רצף נקודות. שני נקודות = קו ישר. עם control = עקומת בזייה.
  points: WallPoint[];
}

// ── אלמנטים קבועים בחדר (שולחן מורה) ──────────────────────
export type FixedElementType =
  | 'teacher_desk_single'  // שולחן מורה רגיל
  | 'teacher_desk_gamma';  // שולחן מורה בצורת Γ

export interface FixedElement {
  id: string;
  type: FixedElementType;
  position: Point;
  rotation: number;       // מעלות
  width: number;
  height: number;
  // עבור Γ — אורך הזרוע השנייה
  gammaArmLength?: number;
}

// ── שולחנות ומושבי תלמידים ────────────────────────────────
// תבנית סידור — מורה בוחר תבנית והאפליקציה יוצרת מספר שולחנות
// קשורים אחד לשני באותה layoutGroup.
export type LayoutTemplate =
  | 'single'      // שולחן יחיד
  | 'pair'        // זוג מושבים על שולחן אחד
  | 'row'         // טור של שולחנות
  | 'cluster'     // גוש של 4 שולחנות
  | 'het_shape'   // צורת ח
  | 'u_shape';    // צורת U

export type ZoneTag =
  | 'front_row'    // שורה קדמית (קרוב ללוח)
  | 'back_row'     // שורה אחורית
  | 'side_column'  // טור צד
  | 'center'       // מרכז
  | 'near_window'  // קרוב לחלון
  | 'near_door'    // קרוב לדלת
  | 'near_wall';   // קרוב לקיר אטום

export interface Desk {
  id: string;
  position: Point;     // מרכז השולחן
  rotation: number;    // מעלות
  seatCount: 1 | 2;
  layoutGroup?: string; // מזהה התבנית שאליה השולחן שייך (אם קיים)
}

export interface Seat {
  id: string;
  deskId: string;
  side: 'left' | 'right' | 'solo';
  // נגזר אוטומטית לפי קרבה לקירות, אך ניתן לערוך ידנית
  autoZones: ZoneTag[];
  // overrides ידניים של המורה
  manualZones?: ZoneTag[];
}

// ── תלמידים ──────────────────────────────────────────────
export type StudentTag =
  | 'vision_needs_front'   // צריך לשבת קדימה בגלל ראייה
  | 'adhd_needs_front'     // צריך לשבת קדימה בגלל קשיי קשב
  | 'tall'                 // גבוה
  | 'quiet'                // שקט
  | 'talkative'            // דברן
  | 'distractible'         // נוטה להסחה
  | 'independent'          // עצמאי
  | 'needs_support'        // זקוק לתמיכה
  | 'positive_influence';  // השפעה חיובית

export interface Student {
  id: string;
  name: string;
  gender?: 'm' | 'f';
  tags: StudentTag[];
  preferredNear: string[]; // ids של תלמידים שעובד טוב לידם
  avoidNear: string[];     // ids של תלמידים שלא מומלץ להושיב לידם
  mustSeparate: string[];  // ids של תלמידים שחייבים הפרדה
  responsibilityScore: number; // 0–100, ברירת מחדל 70
  notes?: string;
}

// ── כיתה (חדר) ────────────────────────────────────────────
export interface Classroom {
  id: string;
  name: string;
  // ממדי הקנבס בפיקסלים (לוגיים)
  width: number;
  height: number;
  walls: Wall[];
  fixedElements: FixedElement[];
  desks: Desk[];
  seats: Seat[];
  createdAt: string;
  updatedAt: string;
}

// ── סידור הושבה ───────────────────────────────────────────
export interface SeatAssignment {
  seatId: string;
  studentId: string;
}

export type WarningSeverity = 'hard' | 'soft' | 'info';

export interface ArrangementWarning {
  type: WarningSeverity;
  message: string;
  studentIds?: string[];
  seatIds?: string[];
}

export interface SeatingArrangement {
  id: string;
  name: string;
  classroomId: string;
  assignments: SeatAssignment[];
  parkedStudentIds: string[]; // תלמידים ב"אזור המתנה" — לא הושבו עדיין
  score: number;              // 0–100
  warnings: ArrangementWarning[];
  notes?: string;
  createdAt: string;
}

// ── אפשרויות לאלגוריתם ────────────────────────────────────
export type ShuffleMode = 'conservative' | 'balanced' | 'full';

export interface GenerateArrangementOptions {
  shuffleMode?: ShuffleMode;
  candidates?: number;        // כמה ניסיונות (default: 50)
  previousArrangement?: SeatingArrangement;
  seed?: number;
}
