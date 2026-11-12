import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = 'success') => {
    const id = ++counter;
    set({ toasts: [...get().toasts, { id, message, tone }] });
    window.setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

export const toast = (message: string, tone: Toast['tone'] = 'success') =>
  useToasts.getState().push(message, tone);
