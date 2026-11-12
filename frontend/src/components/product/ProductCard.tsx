import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Heart, Loader2, Plus, ShoppingBag } from 'lucide-react';
import { Stars } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cx, discountPercent, formatCount, formatSantim } from '@/lib/format';
import { useAddToCart } from '@/lib/queries';
import type { ProductCardData, ProductDetail } from '@/lib/types';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';
import { useWishlist } from '@/stores/wishlist';

const colorHex: Record<string, string> = {
  black: '#181818',
  white: '#f7f7f4',
  ivory: '#efe6d4',
  graphite: '#4a4f57',
  charcoal: '#33373d',
  grey: '#8b9098',
  gray: '#8b9098',
  sand: '#d8c5a5',
  beige: '#e4d6be',
  cognac: '#8b5a2b',
  brown: '#6b4a33',
  navy: '#0b2447',
  blue: '#2f5f9e',
  olive: '#6b7150',
  green: '#41684d',
  cream: '#f3ecdc',
  silver: '#c9ccd1',
  gold: '#c9a227',
  rose: '#d9a6a0',
};

export function ProductCard({
  product,
  priority,
  compact,
}: {
  product: ProductCardData;
  priority?: boolean;
  compact?: boolean;
}) {
  const wished = useWishlist((state) => state.slugs.includes(product.slug));
  const toggle = useWishlist((state) => state.toggle);
  const user = useAuth((state) => state.user);
  const push = useToasts((state) => state.push);
  const navigate = useNavigate();
  const location = useLocation();
  const addToCart = useAddToCart();
  const [quickLoading, setQuickLoading] = useState(false);

  const discount = discountPercent(product.priceSantim, product.compareAtPriceSantim);
  const price = product.minPriceSantim < product.priceSantim ? product.minPriceSantim : product.priceSantim;

  const toggleWishlist = async () => {
    if (!user) {
      push('Sign in to save products to your wishlist.', 'info');
      navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    try {
      const added = await toggle(product.slug);
      push(added ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    } catch (error) {
      push(errorMessage(error), 'error');
    }
  };

  const quickAdd = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!product.inStock) return;
    setQuickLoading(true);
    try {
      const { product: detail } = await api.get<{ product: ProductDetail }>(
        `/products/${encodeURIComponent(product.slug)}`,
      );
      const variant = detail.variants.find((item) => item.inStock);
      if (!variant) {
        push('This product is currently out of stock.', 'error');
        return;
      }
      await addToCart.mutateAsync({ variantId: variant.id, quantity: 1 });
      push(`${product.name} added to your cart.`);
    } catch (error) {
      push(errorMessage(error), 'error');
    } finally {
      setQuickLoading(false);
    }
  };

  return (
    <article className="group relative">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sand">
        <Link to={`/product/${product.slug}`} aria-label={product.name} className="block size-full">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              loading={priority ? 'eager' : 'lazy'}
              className="size-full object-cover transition duration-500 ease-out group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid size-full place-items-center text-sm text-slate-warm">No image</div>
          )}
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {discount != null && (
            <span className="rounded-full bg-red-600 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-white shadow-sm">
              -{discount}%
            </span>
          )}
          {product.isNew && (
            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-brand-900 shadow-sm">
              New
            </span>
          )}
          {product.lowStock && (
            <span className="rounded-full bg-gold-500 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-brand-950 shadow-sm">
              Low stock
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleWishlist}
          aria-label={wished ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={wished}
          className={cx(
            'absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/95 text-brand-900 shadow-sm backdrop-blur transition hover:bg-white',
            wished && 'text-red-600',
          )}
        >
          <Heart className={cx('size-4', wished && 'fill-current')} />
        </button>

        {product.inStock ? (
          <button
            type="button"
            onClick={quickAdd}
            disabled={quickLoading}
            className="absolute bottom-3 right-3 flex h-10 translate-y-2 items-center gap-2 rounded-full bg-white/95 px-3.5 text-[12px] font-bold text-brand-900 opacity-0 shadow-md backdrop-blur transition duration-200 hover:bg-brand-900 hover:text-white group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 disabled:opacity-90 max-sm:translate-y-0 max-sm:opacity-100"
          >
            {quickLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Quick add
          </button>
        ) : (
          <span className="absolute bottom-3 left-3 rounded-full bg-brand-950/85 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>

      <div className="pt-3.5">
        {product.brand && (
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-warm">
            {product.brand.name}
          </p>
        )}
        <h3 className={cx('mt-1 font-sans font-semibold leading-snug text-brand-900', compact ? 'text-[13px]' : 'text-[14px]')}>
          <Link to={`/product/${product.slug}`} className="line-clamp-2 transition hover:text-brand-600">
            {product.name}
          </Link>
        </h3>

        <div className="mt-1.5 flex items-center gap-1.5">
          <Stars value={product.ratingAvg} size={12} label={false} />
          <span className="text-[11px] text-slate-warm">
            {product.ratingCount > 0 ? `${product.ratingAvg.toFixed(1)} (${product.ratingCount})` : 'New arrival'}
          </span>
        </div>

        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-display text-[15px] font-bold text-brand-900">{formatSantim(price)}</span>
            {product.compareAtPriceSantim && product.compareAtPriceSantim > price && (
              <span className="text-[11px] text-slate-warm line-through">
                {formatSantim(product.compareAtPriceSantim)}
              </span>
            )}
          </div>
          {product.colors.length > 0 && (
            <span className="flex -space-x-1" aria-label={`${product.colors.length} colours`}>
              {product.colors.slice(0, 4).map((color) => (
                <span
                  key={color}
                  title={color}
                  className="size-3.5 rounded-full border border-white shadow-sm ring-1 ring-line"
                  style={{ backgroundColor: colorHex[color.toLowerCase()] ?? '#d6d2c9' }}
                />
              ))}
            </span>
          )}
        </div>

        {product.soldCount > 20 && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-warm">
            <ShoppingBag className="size-3" /> {formatCount(product.soldCount)} sold
          </p>
        )}
      </div>
    </article>
  );
}

export function ProductGrid({ products, compact }: { products: ProductCardData[]; compact?: boolean }) {
  return (
    <div
      className={cx(
        'grid gap-x-4 gap-y-8 sm:gap-x-5',
        compact
          ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
          : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {products.map((product, index) => (
        <ProductCard key={product.id} product={product} priority={index < 4} />
      ))}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="aspect-[4/5] animate-pulse rounded-2xl bg-sand" />
      <div className="mt-3.5 space-y-2">
        <div className="h-2.5 w-16 animate-pulse rounded bg-sand" />
        <div className="h-3.5 w-full animate-pulse rounded bg-sand" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-sand" />
        <div className="h-4 w-24 animate-pulse rounded bg-sand" />
      </div>
    </div>
  );
}
