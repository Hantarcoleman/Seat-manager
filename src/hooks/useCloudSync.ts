// סנכרון אוטומטי בין localStorage לבין Supabase
import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useClassroomStore } from '../store/classroomStore';
import { useStudentsStore } from '../store/studentsStore';
import { useArrangementStore } from '../store/arrangementStore';
import { pullUserData, pushUserData } from '../services/cloudSyncService';

export function useCloudSync() {
  const user = useAuthStore((s) => s.user);
  const classrooms = useClassroomStore((s) => s.classrooms);
  const hydrateClassrooms = useClassroomStore((s) => s.hydrateClassrooms);
  const byClassroom = useStudentsStore((s) => s.byClassroom);
  const hydrateStudents = useStudentsStore((s) => s.hydrateStudents);
  const saved = useArrangementStore((s) => s.saved);
  const hydrateSaved = useArrangementStore((s) => s.hydrateSaved);

  const pulledRef = useRef(false);

  // כשהמשתמש מתחבר — טען נתונים מהענן
  useEffect(() => {
    if (!user || pulledRef.current) return;
    pulledRef.current = true;

    pullUserData().then((remote) => {
      if (!remote) return;
      if (Object.keys(remote.classrooms).length > 0) hydrateClassrooms(remote.classrooms);
      if (Object.keys(remote.students).length > 0) hydrateStudents(remote.students);
      if (Object.keys(remote.arrangements).length > 0) hydrateSaved(remote.arrangements);
    });
  }, [user?.id]);

  // כשהמשתמש מתנתק — אפס את סמן ה-pull
  useEffect(() => {
    if (!user) pulledRef.current = false;
  }, [user]);

  // דחוף שינויים לענן (debounce 3 שניות)
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      pushUserData(classrooms, byClassroom, saved);
    }, 3000);
    return () => clearTimeout(timer);
  }, [user, classrooms, byClassroom, saved]);
}
