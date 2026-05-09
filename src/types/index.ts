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
  | 'front_row'    // שורה קדמית ביותר (קרוב ללוח)
  | 'second_row'   // שורה שנייה מהקדמה
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
  | 'needs_very_front'     // חייב/ת לשבת בשורה הקדמית ביותר (שורה 1 בלבד)
  | 'needs_front'          // צריך/ה לשבת באחת משתי השורות הקדמיות
  | 'can_focus_back'       // יכול/ה להתרכז גם מאחור
  | 'tall'                 // גבוה/ה — עדיף בצדדים או מאחור
  | 'needs_wall'           // צריך/ה קיר
  | 'quiet'                // שקט/ה
  | 'talkative'            // דברן/ית
  | 'distractible'         // נוטה להסחה
  | 'better_alone'         // כדאי שישב/תשב לבד
  | 'needs_support'        // זקוק/ה לתמיכה
  | 'positive_influence';  // השפעה חיובית

// גם הצגה בלשון זכר וגם בלשון נקבה
export interface TagDef {
  emoji: string;
  m: string;        // זכר
  f: string;        // נקבה
  neutral: string;  // ניטרלי / כשמין לא ידוע
}

export const TAG_DEFS: Record<StudentTag, TagDef> = {
  needs_very_front:   { emoji: '🔴', m: 'חייב שורה קדמית ביותר', f: 'חייבת שורה קדמית ביותר', neutral: 'חייב/ת שורה קדמית ביותר' },
  needs_front:        { emoji: '👓', m: 'חייב אחת משתי שורות קדמיות', f: 'חייבת אחת משתי שורות קדמיות', neutral: 'חייב/ת אחת משתי שורות קדמיות' },
  can_focus_back:     { emoji: '🔚', m: 'יכול להתרכז מאחור',  f: 'יכולה להתרכז מאחור',  neutral: 'יכול/ה להתרכז מאחור' },
  tall:               { emoji: '📏', m: 'גבוה',                f: 'גבוהה',                neutral: 'גבוה/ה' },
  needs_wall:         { emoji: '🧱', m: 'צריך קיר',            f: 'צריכה קיר',            neutral: 'צריך/ה קיר' },
  quiet:              { emoji: '🤫', m: 'שקט',                 f: 'שקטה',                 neutral: 'שקט/ה' },
  talkative:          { emoji: '💬', m: 'דברן',                f: 'דברנית',               neutral: 'דברן/ית' },
  distractible:       { emoji: '🌀', m: 'נוטה להסחה',          f: 'נוטה להסחה',           neutral: 'נוטה להסחה' },
  better_alone:       { emoji: '⭐', m: 'כדאי שישב לבד',       f: 'כדאי שתשב לבד',        neutral: 'כדאי שישב/תשב לבד' },
  needs_support:      { emoji: '🤝', m: 'זקוק לתמיכה',         f: 'זקוקה לתמיכה',         neutral: 'זקוק/ה לתמיכה' },
  positive_influence: { emoji: '✨', m: 'השפעה חיובית',         f: 'השפעה חיובית',         neutral: 'השפעה חיובית' },
};

// זוגות מאפיינים סותרים — לא ניתן לסמן שניהם יחד
export const CONFLICTING_TAG_PAIRS: [StudentTag, StudentTag][] = [
  ['needs_very_front', 'can_focus_back'],
  ['needs_very_front', 'needs_front'],
  ['needs_front', 'can_focus_back'],
];

export function getConflictingTag(tag: StudentTag): StudentTag | null {
  for (const [a, b] of CONFLICTING_TAG_PAIRS) {
    if (tag === a) return b;
    if (tag === b) return a;
  }
  return null;
}

// מחזיר תווית בעברית עם אימוג'י לפי מין התלמיד
export function tagLabel(tag: StudentTag, gender?: 'm' | 'f' | undefined, includeEmoji = true): string {
  const def = TAG_DEFS[tag];
  if (!def) return tag;
  const text = gender === 'm' ? def.m : gender === 'f' ? def.f : def.neutral;
  return includeEmoji ? `${def.emoji} ${text}` : text;
}

export interface Student {
  id: string;
  name: string;
  gender?: 'm' | 'f';
  tags: StudentTag[];
  preferredNear: string[]; // ids של תלמידים שעובד טוב לידם
  avoidNear: string[];     // ids של תלמידים שלא מומלץ להושיב לידם / חייבים הפרדה
  responsibilityScore: number; // 0–100, ברירת מחדל 70
  notes?: string;
  configured?: boolean;    // האם המורה לחץ "שמור" בטופס (= אופיין)
}

// המרה של תיוגים ישנים לתיוגים החדשים — לתאימות לאחור
export function migrateStudentTags(tags: string[]): StudentTag[] {
  const valid: StudentTag[] = [
    'needs_very_front', 'needs_front', 'can_focus_back', 'tall', 'needs_wall', 'quiet',
    'talkative', 'distractible', 'better_alone', 'needs_support', 'positive_influence',
  ];
  const aliases: Record<string, StudentTag> = {
    vision_needs_front: 'needs_front',
    adhd_needs_front:   'needs_front',
    independent:        'better_alone',
  };
  const result = new Set<StudentTag>();
  for (const t of tags) {
    if (valid.includes(t as StudentTag)) result.add(t as StudentTag);
    else if (aliases[t]) result.add(aliases[t]);
  }
  return Array.from(result);
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
  deskPositions?: Record<string, { x: number; y: number }>; // snapshot מיקומי שולחנות
}

// ── אפשרויות לאלגוריתם ────────────────────────────────────
export type ShuffleMode = 'conservative' | 'balanced' | 'full';

export interface GenerateArrangementOptions {
  shuffleMode?: ShuffleMode;
  candidates?: number;
  previousArrangement?: SeatingArrangement;
  seed?: number;
  separateGenders?: boolean;  // נסה לשבץ עם אותו מין
  mixGenders?: boolean;       // נסה לצמד בן ובת באותו שולחן
  forbiddenGroups?: string[][];  // קבוצות תלמידים שאסור להושיב יחד
}
