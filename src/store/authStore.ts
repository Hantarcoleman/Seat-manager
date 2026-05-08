import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  if (supabase) {
    supabase.auth.getSession().then(({ data }) => {
      set({ user: data.session?.user ?? null, session: data.session ?? null, loading: false });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: session?.user ?? null, session: session ?? null, loading: false });
    });
  }

  return {
    user: null,
    session: null,
    loading: !!supabase,

    signInWithGoogle: async () => {
      if (!supabase) return;
      const base = window.location.origin + (import.meta.env.BASE_URL ?? '/');
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: base },
      });
    },

    signOut: async () => {
      if (!supabase) return;
      await supabase.auth.signOut();
      set({ user: null, session: null });
    },
  };
});
