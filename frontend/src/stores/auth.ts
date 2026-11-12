import { create } from 'zustand';
import { api, errorMessage } from '@/lib/api';
import type { AuthUser } from '@/lib/types';

type Status = 'loading' | 'guest' | 'authenticated';

interface AuthState {
  user: AuthUser | null;
  status: Status;
  error: string | null;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
    marketingOptIn?: boolean;
  }) => Promise<{ user: AuthUser | null; requiresVerification?: boolean; email?: string; devVerifyUrl?: string }>;
  logout: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  status: 'loading',
  error: null,

  setUser: (user) => set({ user, status: user ? 'authenticated' : 'guest' }),

  load: async () => {
    try {
      const result = await api.get<{ user: AuthUser | null }>('/auth/me');
      set({ user: result.user, status: result.user ? 'authenticated' : 'guest', error: null });
    } catch {
      set({ user: null, status: 'guest', error: null });
    }
  },

  login: async (email, password) => {
    const result = await api.post<{ user: AuthUser }>('/auth/login', { email, password });
    set({ user: result.user, status: 'authenticated', error: null });
    return result.user;
  },

  register: async (input) => {
    const result = await api.post<{
      user: AuthUser | null;
      requiresVerification?: boolean;
      email?: string;
      devVerifyUrl?: string;
    }>('/auth/register', input);
    if (result.user) set({ user: result.user, status: 'authenticated', error: null });
    return result;
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.warn(errorMessage(error));
    }
    set({ user: null, status: 'guest', error: null });
  },
}));
