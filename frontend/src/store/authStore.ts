import { create } from 'zustand';
import { User } from '@/types/user';

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  
  setAuth: (user, token) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('access_token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }
    set({ user, token });
  },
  
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
    }
    set({ user: null, token: null });
  },
  
  initAuth: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const userStr = localStorage.getItem('user');
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ user, token });
        } catch (e) {
          console.error('Failed to parse user', e);
        }
      }
    }
  },
}));
