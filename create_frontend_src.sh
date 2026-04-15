#!/bin/bash

# TimeSync Phase 1 - Frontend Source Files Generator
# Creates all React/TypeScript component files

set -e

echo "🎨 Creating all frontend source files..."

cd "$(dirname "$0")/frontend/src"

# ============================================
# src/lib/api.ts
# ============================================
cat > lib/api.ts << 'ENDOFFILE'
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
ENDOFFILE

# ============================================
# src/lib/utils.ts
# ============================================
cat > lib/utils.ts << 'ENDOFFILE'
import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
ENDOFFILE

# ============================================
# src/types/user.ts
# ============================================
cat > types/user.ts << 'ENDOFFILE'
export interface User {
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  avatar?: string;
}

export interface LoginRequest {
  email: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}
ENDOFFILE

# ============================================
# src/store/authStore.ts
# ============================================
cat > store/authStore.ts << 'ENDOFFILE'
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
ENDOFFILE

echo "✅ All source files created!"
