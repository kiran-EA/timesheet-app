'use client';

import { create } from 'zustand';
import { User, AuthResponse } from '@/types/user';

interface AuthStore {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  setToken: (token: string) => void;
  logout: () => void;
}

function loadUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

export const useAuthStore = create<AuthStore>((set) => ({
  user:      loadUser(),
  token:     typeof window !== 'undefined' ? localStorage.getItem('access_token') : null,
  isLoading: false,
  error:     null,

  setToken: (token: string) => {
    if (typeof window !== 'undefined') localStorage.setItem('access_token', token);
    set({ token });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
    set({ user: null, token: null, error: null });
  },

  setUser: (user: User | null) => {
    if (typeof window !== 'undefined') {
      if (user) localStorage.setItem('user', JSON.stringify(user));
      else localStorage.removeItem('user');
    }
    set({ user });
  },
}));
