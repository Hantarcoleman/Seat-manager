# CLAUDE.md — סידור חכם לכיתה

הוראות ל-Claude Code לעבודה בפרויקט.

---

## תיאור הפרויקט

אפליקציה למורים (מחנכי כיתה) לבניית סידור הושבה לתלמידים בכיתה.

**שפה:** עברית בלבד, RTL.
**משתמש יעד:** מורים בחטיבת ביניים ותיכון.

**3 שלבי עבודה במורה (UX flow):**
1. **בניית מבנה הכיתה** — קנבס חופשי עם קירות (לוח, חלון לחצר, חלון ללובי, חלון קטן, קיר אטום, דלת), שולחן מורה (יחיד / Γ), עיקולים מותרים.
2. **סידור שולחנות** — טורים, גושים (קבוצות), ח, U, שולחנות בודדים.
3. **שיבוץ תלמידים** — דרישות פיזיות (קדמי/חלון/קיר), העדפות חברתיות (יחד/בנפרד), אזור המתנה לתלמידים לא משובצים.

תוכנית מלאה: `C:\Users\eitan\.claude\plans\parsed-giggling-dijkstra.md`.

---

## Stack

- **Vite + React + TypeScript**
- **react-konva** — קנבס לעריכת חדר ותצוגת תלמידים
- **@dnd-kit/core** — drag-drop של תלמידים בין מושבים
- **zustand** — ניהול state עם persist ל-localStorage
- **react-router-dom** — ניווט
- **tailwindcss** — עיצוב
- **papaparse + xlsx** — ייבוא תלמידים מ-CSV/Excel
- **@supabase/supabase-js** — sync ענן (לאחר localStorage)

---

## פקודות פיתוח

```bash
npm run dev      # שרת פיתוח על http://localhost:5173
npm run build    # build לפרודקשן ל-dist/
npm run preview  # תצוגה מקדימה של ה-build
npm run lint     # ESLint
```

---

## עקרונות UX

- **בעברית בלבד** — כל הלייבלים, השגיאות, ה-tooltips וההודעות
- **RTL מלא** — `dir="rtl"`, `lang="he"`
- **ניטרלי-פדגוגי** — אסור: "אסור", "אויב", "תלמיד בעייתי", "עונש". מותר: "לא מומלץ", "כדאי לבדוק", "המלצה".
- **מורה במשליטה** — האלגוריתם מציע, המורה מחליט. תמיד אפשר לדרוס המלצה ידנית.
- **פרטיות** — לא שולחים לשרת מידע אישי בלי הסכמה. הודעת פרטיות בעמוד הראשי.

---

## ארכיטקטורה (יעד — לא הכל קיים עדיין)

```
src/
├── types/index.ts                  # כל ה-TS types (Classroom, Student, Wall, Desk, Seat, Arrangement…)
├── store/
│   ├── classroomStore.ts            # Zustand — מבנה הכיתה
│   ├── studentsStore.ts             # רשימת תלמידים
│   └── arrangementStore.ts          # סידור נוכחי + saved
├── services/
│   ├── persistenceService.ts        # localStorage + Supabase
│   ├── seatingAlgorithm.ts          # יצירת סידור מתוך constraints
│   ├── scoringService.ts            # ניקוד והפרות
│   ├── csvImportService.ts          # papaparse
│   └── supabaseClient.ts
├── components/
│   ├── canvas/
│   │   ├── RoomEditor.tsx           # קנבס בניית חדר
│   │   ├── DeskLayoutEditor.tsx     # הצבת שולחנות
│   │   ├── SeatingCanvas.tsx        # תצוגה + עריכה ידנית
│   │   └── tools/                   # WallTool, DoorTool, …
│   ├── students/
│   │   ├── StudentList.tsx
│   │   ├── StudentForm.tsx
│   │   ├── StudentParkingLot.tsx    # תלמידים שעוד לא הושבו
│   │   └── CsvImport.tsx
│   ├── arrangement/
│   └── common/
├── pages/
│   ├── Dashboard.tsx
│   ├── ClassroomSetup.tsx
│   ├── StudentManager.tsx
│   ├── ArrangementPage.tsx
│   └── SavedArrangementsPage.tsx
└── styles/
    └── globals.css                  # theme tokens
```

---

## Theme tokens (CSS variables)

קיימים ב-`src/index.css`:

```
--bg, --bg2, --sf            רקעים
--ink, --ink2, --ink3        טקסט (ראשי / משני / כהה)
--ac (#ea580c), --abg, --abd  accent כתום
--gn (ירוק=שובץ), --rd (אדום=הפרה), --bl (כחול=מידע)
--r:12px, --rs:8px, --rx:30px (pill)
--sh, --shl                  צלליות
```

Dark mode: `<html data-theme="dark">` — overrides ב-`[data-theme="dark"]`.

---

## הערות קוד

- כל ההערות בקוד **בעברית**
- שמות פונקציות ומשתנים — באנגלית
- TypeScript strict — לא להשתמש ב-`any` בלי סיבה ברורה

---

## TODO גדול (לפי תוכנית)

- [x] שלב 0: Setup
- [ ] שלב 1: Types + Stores
- [ ] שלב 2: Room Editor (Konva canvas) — לב ה-MVP
- [ ] שלב 3: Desk Layout Tool
- [ ] שלב 4: Student Management + CSV
- [ ] שלב 5: Seating Algorithm + Manual Editor
- [ ] שלב 6: Persistence (localStorage + Supabase)
- [ ] שלב 7: Saved arrangements
