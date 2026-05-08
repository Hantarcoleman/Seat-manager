import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Classroom, Wall, FixedElement, Desk, Seat } from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);
const HISTORY_CAP = 80;

interface ClassroomState {
  classrooms: Record<string, Classroom>;
  currentId: string | null;

  // היסטוריה ל-undo/redo (לא נשמרת ב-localStorage)
  _history: Record<string, Classroom[]>;
  _future: Record<string, Classroom[]>;

  // ── ניהול כיתות ──
  createClassroom: (name: string, width?: number, height?: number) => string;
  setCurrent: (id: string | null) => void;
  renameClassroom: (id: string, name: string) => void;
  deleteClassroom: (id: string) => void;

  // ── קירות ──
  addWall: (wall: Omit<Wall, 'id'>) => string;
  updateWall: (id: string, patch: Partial<Wall>) => void;
  removeWall: (id: string) => void;

  // ── אלמנטים קבועים ──
  addFixedElement: (el: Omit<FixedElement, 'id'>) => string;
  updateFixedElement: (id: string, patch: Partial<FixedElement>) => void;
  removeFixedElement: (id: string) => void;

  // ── שולחנות ומושבים ──
  addDesk: (desk: Omit<Desk, 'id'>, seats: Omit<Seat, 'id' | 'deskId'>[]) => string;
  updateDesk: (id: string, patch: Partial<Desk>) => void;
  removeDesk: (id: string) => void;
  updateSeat: (id: string, patch: Partial<Seat>) => void;

  hydrateClassrooms: (classrooms: Record<string, Classroom>) => void;
  // ── ניקוי כללי ──
  clearAll: () => void;

  // ── undo/redo ──
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const blankClassroom = (id: string, name: string, width: number, height: number): Classroom => ({
  id, name, width, height,
  walls: [], fixedElements: [], desks: [], seats: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// helper — מבצע מוטציה על הכיתה הנוכחית, רושם snapshot בהיסטוריה,
// מנקה את ה-future stack (כי פעולה חדשה אחרי undo מוחקת את ה-redo)
function mutateAndRecord(
  state: ClassroomState,
  fn: (c: Classroom) => Classroom
): Partial<ClassroomState> {
  if (!state.currentId) return {};
  const id = state.currentId;
  const c = state.classrooms[id];
  if (!c) return {};
  const past = state._history[id] ?? [];
  const newPast = [...past, c].slice(-HISTORY_CAP);
  const updated = { ...fn(c), updatedAt: new Date().toISOString() };
  return {
    classrooms: { ...state.classrooms, [id]: updated },
    _history: { ...state._history, [id]: newPast },
    _future: { ...state._future, [id]: [] },
  };
}

export const useClassroomStore = create<ClassroomState>()(
  persist(
    (set, get) => ({
      classrooms: {},
      currentId: null,
      _history: {},
      _future: {},

      createClassroom: (name, width = 1200, height = 800) => {
        const id = uid();
        const c = blankClassroom(id, name, width, height);
        set((s) => ({
          classrooms: { ...s.classrooms, [id]: c },
          currentId: id,
          _history: { ...s._history, [id]: [] },
          _future: { ...s._future, [id]: [] },
        }));
        return id;
      },

      setCurrent: (id) => set({ currentId: id }),

      renameClassroom: (id, name) =>
        set((s) => {
          const c = s.classrooms[id];
          if (!c) return {};
          return { classrooms: { ...s.classrooms, [id]: { ...c, name, updatedAt: new Date().toISOString() } } };
        }),

      deleteClassroom: (id) =>
        set((s) => {
          const next = { ...s.classrooms };
          delete next[id];
          const nh = { ...s._history }; delete nh[id];
          const nf = { ...s._future }; delete nf[id];
          return { classrooms: next, _history: nh, _future: nf, currentId: s.currentId === id ? null : s.currentId };
        }),

      addWall: (wall) => {
        const id = uid();
        set((s) => mutateAndRecord(s, (c) => ({ ...c, walls: [...c.walls, { ...wall, id }] })));
        return id;
      },

      updateWall: (id, patch) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          walls: c.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }))),

      removeWall: (id) =>
        set((s) => mutateAndRecord(s, (c) => ({ ...c, walls: c.walls.filter((w) => w.id !== id) }))),

      addFixedElement: (el) => {
        const id = uid();
        set((s) => mutateAndRecord(s, (c) => ({ ...c, fixedElements: [...c.fixedElements, { ...el, id }] })));
        return id;
      },

      updateFixedElement: (id, patch) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          fixedElements: c.fixedElements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }))),

      removeFixedElement: (id) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          fixedElements: c.fixedElements.filter((e) => e.id !== id),
        }))),

      addDesk: (desk, seatTemplates) => {
        const deskId = uid();
        const newSeats: Seat[] = seatTemplates.map((t) => ({ ...t, id: uid(), deskId }));
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          desks: [...c.desks, { ...desk, id: deskId }],
          seats: [...c.seats, ...newSeats],
        })));
        return deskId;
      },

      updateDesk: (id, patch) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          desks: c.desks.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }))),

      removeDesk: (id) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          desks: c.desks.filter((d) => d.id !== id),
          seats: c.seats.filter((seat) => seat.deskId !== id),
        }))),

      updateSeat: (id, patch) =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          seats: c.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)),
        }))),

      hydrateClassrooms: (classrooms) =>
        set((s) => ({ classrooms: { ...classrooms, ...s.classrooms } })),

      // ── ניקוי כללי ──
      clearAll: () =>
        set((s) => mutateAndRecord(s, (c) => ({
          ...c,
          walls: [],
          fixedElements: [],
          desks: [],
          seats: [],
        }))),

      // ── undo/redo ──
      undo: () =>
        set((s) => {
          if (!s.currentId) return {};
          const id = s.currentId;
          const past = s._history[id] ?? [];
          if (past.length === 0) return {};
          const previous = past[past.length - 1];
          const newPast = past.slice(0, -1);
          const current = s.classrooms[id];
          const future = s._future[id] ?? [];
          return {
            classrooms: { ...s.classrooms, [id]: previous },
            _history: { ...s._history, [id]: newPast },
            _future: { ...s._future, [id]: current ? [...future, current] : future },
          };
        }),

      redo: () =>
        set((s) => {
          if (!s.currentId) return {};
          const id = s.currentId;
          const future = s._future[id] ?? [];
          if (future.length === 0) return {};
          const next = future[future.length - 1];
          const newFuture = future.slice(0, -1);
          const current = s.classrooms[id];
          const past = s._history[id] ?? [];
          return {
            classrooms: { ...s.classrooms, [id]: next },
            _future: { ...s._future, [id]: newFuture },
            _history: { ...s._history, [id]: current ? [...past, current] : past },
          };
        }),

      canUndo: () => {
        const s = get();
        if (!s.currentId) return false;
        return (s._history[s.currentId]?.length ?? 0) > 0;
      },

      canRedo: () => {
        const s = get();
        if (!s.currentId) return false;
        return (s._future[s.currentId]?.length ?? 0) > 0;
      },
    }),
    {
      name: 'seating_classrooms_v1',
      // לא לשמור את ההיסטוריה ב-localStorage
      partialize: (state) => ({
        classrooms: state.classrooms,
        currentId: state.currentId,
      }) as Partial<ClassroomState>,
    }
  )
);
