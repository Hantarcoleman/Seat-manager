import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Student } from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);

interface StudentsState {
  // map by classroomId → תלמידים בכיתה זו
  byClassroom: Record<string, Student[]>;

  hydrateStudents: (byClassroom: Record<string, Student[]>) => void;
  add: (classroomId: string, student: Omit<Student, 'id'>) => string;
  update: (classroomId: string, id: string, patch: Partial<Student>) => void;
  remove: (classroomId: string, id: string) => void;
  importMany: (classroomId: string, students: Omit<Student, 'id'>[]) => void;
  clear: (classroomId: string) => void;
  get: (classroomId: string) => Student[];
}

export const useStudentsStore = create<StudentsState>()(
  persist(
    (set, getState) => ({
      byClassroom: {},

      hydrateStudents: (incoming) =>
        set((s) => ({ byClassroom: { ...incoming, ...s.byClassroom } })),

      add: (classroomId, student) => {
        const id = uid();
        const full: Student = { ...student, id };
        set((s) => {
          const list = s.byClassroom[classroomId] ?? [];
          return { byClassroom: { ...s.byClassroom, [classroomId]: [...list, full] } };
        });
        return id;
      },

      update: (classroomId, id, patch) =>
        set((s) => {
          const list = s.byClassroom[classroomId] ?? [];
          return {
            byClassroom: {
              ...s.byClassroom,
              [classroomId]: list.map((stu) => (stu.id === id ? { ...stu, ...patch } : stu)),
            },
          };
        }),

      remove: (classroomId, id) =>
        set((s) => {
          const list = s.byClassroom[classroomId] ?? [];
          return {
            byClassroom: { ...s.byClassroom, [classroomId]: list.filter((stu) => stu.id !== id) },
          };
        }),

      importMany: (classroomId, students) => {
        const withIds: Student[] = students.map((stu) => ({ ...stu, id: uid() }));
        set((s) => ({
          byClassroom: { ...s.byClassroom, [classroomId]: withIds },
        }));
      },

      clear: (classroomId) =>
        set((s) => {
          const next = { ...s.byClassroom };
          delete next[classroomId];
          return { byClassroom: next };
        }),

      get: (classroomId) => getState().byClassroom[classroomId] ?? [],
    }),
    { name: 'seating_students_v1' }
  )
);
