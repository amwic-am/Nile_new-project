import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ViewedProduct {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  priceSantim: number;
  compareAtPriceSantim: number | null;
  viewedAt: number;
}

interface RecentlyViewedState {
  items: ViewedProduct[];
  record: (product: Omit<ViewedProduct, 'viewedAt'>) => void;
  clear: () => void;
}

export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set, get) => ({
      items: [],
      record: (product) => {
        const next = [
          { ...product, viewedAt: Date.now() },
          ...get().items.filter((item) => item.id !== product.id),
        ].slice(0, 12);
        set({ items: next });
      },
      clear: () => set({ items: [] }),
    }),
    { name: 'nilemart-recently-viewed' },
  ),
);
