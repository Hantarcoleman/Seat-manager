import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeatingArrangement, SeatAssignment, ArrangementWarning } from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);

interface ArrangementState {
  saved: Record<string, SeatingArrangement>;
  // הסידור הפעיל הנוכחי לפי classroomId — בעבודה לפני שמירה רשמית
  workingByClassroom: Record<string, SeatingArrangement | undefined>;

  // ── עבודה על סידור פעיל ──
  setWorking: (classroomId: string, arr: SeatingArrangement | undefined) => void;
  updateAssignments: (classroomId: string, assignments: SeatAssignment[]) => void;
  setParked: (classroomId: string, ids: string[]) => void;
  setScoreAndWarnings: (classroomId: string, score: number, warnings: ArrangementWarning[]) => void;

  // ── שמירה / שחזור ──
  saveCurrent: (classroomId: string, name: string) => string | null;
  restore: (id: string) => void;
  duplicate: (id: string, newName?: string) => string | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  listForClassroom: (classroomId: string) => SeatingArrangement[];
}

export const useArrangementStore = create<ArrangementState>()(
  persist(
    (set, get) => ({
      saved: {},
      workingByClassroom: {},

      setWorking: (classroomId, arr) =>
        set((s) => ({ workingByClassroom: { ...s.workingByClassroom, [classroomId]: arr } })),

      updateAssignments: (classroomId, assignments) =>
        set((s) => {
          const cur = s.workingByClassroom[classroomId];
          if (!cur) return {};
          return {
            workingByClassroom: {
              ...s.workingByClassroom,
              [classroomId]: { ...cur, assignments },
            },
          };
        }),

      setParked: (classroomId, ids) =>
        set((s) => {
          const cur = s.workingByClassroom[classroomId];
          if (!cur) return {};
          return {
            workingByClassroom: {
              ...s.workingByClassroom,
              [classroomId]: { ...cur, parkedStudentIds: ids },
            },
          };
        }),

      setScoreAndWarnings: (classroomId, score, warnings) =>
        set((s) => {
          const cur = s.workingByClassroom[classroomId];
          if (!cur) return {};
          return {
            workingByClassroom: {
              ...s.workingByClassroom,
              [classroomId]: { ...cur, score, warnings },
            },
          };
        }),

      saveCurrent: (classroomId, name) => {
        const cur = get().workingByClassroom[classroomId];
        if (!cur) return null;
        const id = uid();
        const snapshot: SeatingArrangement = {
          ...cur,
          id,
          name,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ saved: { ...s.saved, [id]: snapshot } }));
        return id;
      },

      restore: (id) => {
        const arr = get().saved[id];
        if (!arr) return;
        // העתקה למצב עבודה (עם id חדש כדי לא לדרוס את המקור)
        const working: SeatingArrangement = { ...arr, id: uid() };
        set((s) => ({
          workingByClassroom: { ...s.workingByClassroom, [arr.classroomId]: working },
        }));
      },

      duplicate: (id, newName) => {
        const arr = get().saved[id];
        if (!arr) return null;
        const newId = uid();
        const copy: SeatingArrangement = {
          ...arr,
          id: newId,
          name: newName ?? `${arr.name} — עותק`,
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ saved: { ...s.saved, [newId]: copy } }));
        return newId;
      },

      rename: (id, name) =>
        set((s) => {
          const arr = s.saved[id];
          if (!arr) return {};
          return { saved: { ...s.saved, [id]: { ...arr, name } } };
        }),

      remove: (id) =>
        set((s) => {
          const next = { ...s.saved };
          delete next[id];
          return { saved: next };
        }),

      listForClassroom: (classroomId) =>
        Object.values(get().saved)
          .filter((a) => a.classroomId === classroomId)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }),
    { name: 'seating_arrangements_v1' }
  )
);
