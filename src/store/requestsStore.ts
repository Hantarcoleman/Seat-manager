import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SeatRequest, SeatRequestStatus } from '../types';

const uid = () => Math.random().toString(36).slice(2, 10);

interface RequestsState {
  // map classroomId → בקשות
  byClassroom: Record<string, SeatRequest[]>;

  add: (req: Omit<SeatRequest, 'id' | 'status' | 'createdAt'>) => string;
  respond: (classroomId: string, id: string, status: SeatRequestStatus, response: string) => void;
  remove: (classroomId: string, id: string) => void;
  get: (classroomId: string) => SeatRequest[];
  getAll: () => SeatRequest[];
}

export const useRequestsStore = create<RequestsState>()(
  persist(
    (set, getState) => ({
      byClassroom: {},

      add: (req) => {
        const id = uid();
        const full: SeatRequest = {
          ...req,
          id,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        set((s) => {
          const list = s.byClassroom[req.classroomId] ?? [];
          return { byClassroom: { ...s.byClassroom, [req.classroomId]: [...list, full] } };
        });
        return id;
      },

      respond: (classroomId, id, status, response) =>
        set((s) => {
          const list = s.byClassroom[classroomId] ?? [];
          return {
            byClassroom: {
              ...s.byClassroom,
              [classroomId]: list.map((r) =>
                r.id === id ? { ...r, status, response, respondedAt: new Date().toISOString() } : r
              ),
            },
          };
        }),

      remove: (classroomId, id) =>
        set((s) => {
          const list = s.byClassroom[classroomId] ?? [];
          return {
            byClassroom: { ...s.byClassroom, [classroomId]: list.filter((r) => r.id !== id) },
          };
        }),

      get: (classroomId) => getState().byClassroom[classroomId] ?? [],

      getAll: () => {
        const { byClassroom } = getState();
        return Object.values(byClassroom).flat();
      },
    }),
    { name: 'seating_requests_v1' }
  )
);
