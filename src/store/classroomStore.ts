import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Classroom, Wall, FixedElement, Desk, Seat } from '../types';

// יוצר id קצר ייחודי
const uid = () => Math.random().toString(36).slice(2, 10);

interface ClassroomState {
  classrooms: Record<string, Classroom>;
  currentId: string | null;

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
}

const blankClassroom = (id: string, name: string, width: number, height: number): Classroom => ({
  id,
  name,
  width,
  height,
  walls: [],
  fixedElements: [],
  desks: [],
  seats: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// helper — מחזיר עותק חדש של הכיתה הנוכחית עם updatedAt מעודכן
function mutateCurrent(
  state: ClassroomState,
  fn: (c: Classroom) => Classroom
): Partial<ClassroomState> {
  if (!state.currentId) return {};
  const c = state.classrooms[state.currentId];
  if (!c) return {};
  const updated = { ...fn(c), updatedAt: new Date().toISOString() };
  return { classrooms: { ...state.classrooms, [c.id]: updated } };
}

export const useClassroomStore = create<ClassroomState>()(
  persist(
    (set, _get) => ({
      classrooms: {},
      currentId: null,

      createClassroom: (name, width = 1200, height = 800) => {
        const id = uid();
        const c = blankClassroom(id, name, width, height);
        set((s) => ({
          classrooms: { ...s.classrooms, [id]: c },
          currentId: id,
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
          return {
            classrooms: next,
            currentId: s.currentId === id ? null : s.currentId,
          };
        }),

      addWall: (wall) => {
        const id = uid();
        set((s) => mutateCurrent(s, (c) => ({ ...c, walls: [...c.walls, { ...wall, id }] })));
        return id;
      },

      updateWall: (id, patch) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          walls: c.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }))),

      removeWall: (id) =>
        set((s) => mutateCurrent(s, (c) => ({ ...c, walls: c.walls.filter((w) => w.id !== id) }))),

      addFixedElement: (el) => {
        const id = uid();
        set((s) => mutateCurrent(s, (c) => ({ ...c, fixedElements: [...c.fixedElements, { ...el, id }] })));
        return id;
      },

      updateFixedElement: (id, patch) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          fixedElements: c.fixedElements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        }))),

      removeFixedElement: (id) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          fixedElements: c.fixedElements.filter((e) => e.id !== id),
        }))),

      addDesk: (desk, seatTemplates) => {
        const deskId = uid();
        const newSeats: Seat[] = seatTemplates.map((t) => ({ ...t, id: uid(), deskId }));
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          desks: [...c.desks, { ...desk, id: deskId }],
          seats: [...c.seats, ...newSeats],
        })));
        return deskId;
      },

      updateDesk: (id, patch) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          desks: c.desks.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }))),

      removeDesk: (id) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          desks: c.desks.filter((d) => d.id !== id),
          seats: c.seats.filter((seat) => seat.deskId !== id),
        }))),

      updateSeat: (id, patch) =>
        set((s) => mutateCurrent(s, (c) => ({
          ...c,
          seats: c.seats.map((seat) => (seat.id === id ? { ...seat, ...patch } : seat)),
        }))),
    }),
    { name: 'seating_classrooms_v1' }
  )
);
