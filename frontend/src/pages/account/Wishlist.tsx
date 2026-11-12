import { useEffect } from 'react';
import { Heart } from 'lucide-react';
import { ProductCard } from '@/components/product/ProductCard';
import { ButtonLink, EmptyState, Skeleton } from '@/components/ui';
import { useWishlist } from '@/stores/wishlist';
import { useSeo } from '@/lib/seo';

export default function AccountWishlistPage() {
  const items = useWishlist((state) => state.items);
  const loaded = useWishlist((state) => state.loaded);
  const load = useWishlist((state) => state.load);

  useSeo({
    title: 'Your wishlist',
    description: 'Products saved to your Nile Mart wishlist.',
    canonicalPath: '/account/wishlist',
    noIndex: true,
  });

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-brand-900">Wishlist</h2>
          <p className="mt-0.5 text-[12px] text-slate-warm">
            Saved products are kept with your account across devices.
          </p>
        </div>
        {loaded && items.length > 0 && (
          <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-semibold text-slate-warm">
            {items.length} {items.length === 1 ? 'product' : 'products'}
          </span>
        )}
      </div>

      {!loaded ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="space-y-3">
              <Skeleton className="aspect-[4/5] rounded-2xl" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<Heart className="size-6" />}
            title="Your wishlist is empty"
            description="Tap the heart on any product to save it here for later."
            action={<ButtonLink to="/products">Discover products</ButtonLink>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-7 sm:grid-cols-3 sm:gap-x-5">
          {items.map((product, index) => (
            <ProductCard key={product.id} product={product} priority={index < 3} />
          ))}
        </div>
      )}
    </div>
  );
}
