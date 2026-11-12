import { create } from 'zustand';

interface CartUiState {
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useCartUi = create<CartUiState>((set) => ({
  drawerOpen: false,
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
