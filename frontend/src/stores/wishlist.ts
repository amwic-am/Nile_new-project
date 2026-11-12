import { create } from 'zustand';
import { api } from '@/lib/api';
import type { ProductCardData } from '@/lib/types';

interface WishlistState {
  slugs: string[];
  items: ProductCardData[];
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (slug: string) => Promise<boolean>;
  reset: () => void;
}

export const useWishlist = create<WishlistState>((set, get) => ({
  slugs: [],
  items: [],
  loaded: false,

  load: async () => {
    try {
      const result = await api.get<{ products: ProductCardData[]; count: number }>('/wishlist');
      set({
        items: result.products,
        slugs: result.products.map((product) => product.slug),
        loaded: true,
      });
    } catch {
      set({ items: [], slugs: [], loaded: true });
    }
  },

  toggle: async (slug) => {
    const active = get().slugs.includes(slug);
    if (active) {
      await api.delete(`/wishlist/${encodeURIComponent(slug)}`);
      set({
        slugs: get().slugs.filter((item) => item !== slug),
        items: get().items.filter((item) => item.slug !== slug),
      });
      return false;
    }
    await api.post('/wishlist', { slug });
    set({ slugs: [...get().slugs, slug] });
    void get().load();
    return true;
  },

  reset: () => set({ slugs: [], items: [], loaded: false }),
}));
