import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Dumbbell,
  Headphones,
  HeartHandshake,
  Home,
  Laptop,
  PackageCheck,
  Quote,
  RotateCcw,
  ShieldCheck,
  Shirt,
  Smartphone,
  Sparkles,
  Truck,
} from 'lucide-react';
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard';
import { ButtonLink, Stars } from '@/components/ui';
import { formatCount, formatSantim, cx } from '@/lib/format';
import type { Banner, Brand, CategoryNode, ProductCardData, Testimonial } from '@/lib/types';
import { useRecentlyViewed } from '@/stores/recently-viewed';

const categoryIcons: Record<string, React.ReactNode> = {
  electronics: <Headphones className="size-6" />,
  'phones-accessories': <Smartphone className="size-6" />,
  'computers-accessories': <Laptop className="size-6" />,
  fashion: <Shirt className="size-6" />,
  'home-living': <Home className="size-6" />,
  'beauty-personal-care': <Sparkles className="size-6" />,
  'sports-outdoor': <Dumbbell className="size-6" />,
  'office-supplies': <Briefcase className="size-6" />,
};

export function Hero({ banner }: { banner: Banner | undefined }) {
  const title = banner?.title ?? 'Everyday essentials, thoughtfully chosen.';
  const subtitle =
    banner?.subtitle ?? 'Discover quality finds for your home, work and everyday life.';
  const eyebrow = banner?.eyebrow ?? 'Welcome to Nile Mart';
  const linkUrl = banner?.linkUrl ?? '/products';
  const linkLabel = banner?.linkLabel ?? 'Shop the collection';
  const imageUrl = banner?.imageUrl ?? (banner ? '/uploads/seed/hero.png' : null);

  return (
    <section className="container-page pt-4 sm:pt-6">
      <div className="relative overflow-hidden rounded-[26px] bg-brand-950">
        <div
          className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(201,162,39,0.35), transparent 65%)' }}
        />
        <div className="grid lg:grid-cols-[1.08fr_1fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-20">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-gold-400/30 bg-gold-400/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-gold-300">
              <span className="size-1.5 rounded-full bg-gold-400" />
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-xl font-display text-[34px] font-extrabold leading-[1.06] tracking-tight text-white sm:text-[44px] lg:text-[52px]">
              {title}
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/65 sm:text-[15px]">{subtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink
                to={linkUrl}
                size="lg"
                variant="gold"
                iconRight={<ArrowRight className="size-4" />}
              >
                {linkLabel}
              </ButtonLink>
              <ButtonLink
                to="/products?deals=1"
                size="lg"
                className="border border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10"
              >
                Today's deals
              </ButtonLink>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11.5px] font-medium text-white/55">
              <span className="flex items-center gap-1.5">
                <Truck className="size-3.5 text-gold-400" /> Free delivery over ETB 3,000
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-gold-400" /> Verified payments
              </span>
              <span className="flex items-center gap-1.5">
                <RotateCcw className="size-3.5 text-gold-400" /> 7-day returns
              </span>
            </div>
          </div>

          <div className="relative min-h-[320px] overflow-hidden lg:min-h-[520px]">
            {imageUrl && (
              <img
                src={imageUrl}
                alt=""
                className="absolute inset-0 size-full object-cover object-center"
                {...{ fetchpriority: 'high' }}
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/10 to-transparent lg:bg-gradient-to-r lg:from-brand-950 lg:via-brand-950/10 lg:to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-md lg:left-8 lg:right-8">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-300">This week</p>
                <p className="mt-0.5 text-sm font-semibold text-white">Up to 20% off home & audio</p>
              </div>
              <Link
                to="/products?deals=1"
                className="grid size-10 place-items-center rounded-full bg-white text-brand-900 transition hover:bg-gold-400"
                aria-label="Shop weekly offers"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TrustStrip() {
  const items = [
    { icon: <Truck className="size-5" />, title: 'Delivery across Ethiopia', copy: 'Addis Ababa same-week, regions 3-5 days' },
    { icon: <BadgeCheck className="size-5" />, title: 'Genuine products', copy: 'Sourced from authorised suppliers' },
    { icon: <ShieldCheck className="size-5" />, title: 'Protected payments', copy: 'Server-verified, never stored card data' },
    { icon: <HeartHandshake className="size-5" />, title: 'Local support', copy: 'A real team in Addis Ababa' },
  ];
  return (
    <section className="container-page mt-6">
      <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-3 bg-white px-4 py-4 sm:px-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-800">
              {item.icon}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-brand-900">{item.title}</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-slate-warm">{item.copy}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CategoryGrid({ categories }: { categories: CategoryNode[] }) {
  if (!categories.length) return null;
  return (
    <section className="container-page mt-12 sm:mt-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Shop by category</p>
          <h2 className="text-2xl font-bold sm:text-[28px]">Find your everyday upgrade</h2>
        </div>
        <Link
          to="/products"
          className="group flex items-center gap-1.5 text-sm font-semibold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
        >
          Browse everything
          <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            to={`/category/${category.slug}`}
            className={cx(
              'group relative flex min-h-[136px] flex-col justify-between overflow-hidden rounded-2xl border p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-soft sm:min-h-[156px] sm:p-5',
              index % 4 === 0
                ? 'border-brand-900 bg-brand-900 text-white'
                : 'border-line bg-white text-brand-900',
            )}
          >
            <span
              className={cx(
                'grid size-10 place-items-center rounded-xl',
                index % 4 === 0 ? 'bg-white/10 text-gold-300' : 'bg-cream text-brand-800',
              )}
            >
              {categoryIcons[category.slug] ?? <PackageCheck className="size-6" />}
            </span>
            <div>
              <p className="text-[15px] font-bold leading-tight">{category.name}</p>
              <p
                className={cx(
                  'mt-1 text-[11.5px]',
                  index % 4 === 0 ? 'text-white/55' : 'text-slate-warm',
                )}
              >
                {category.productCount} {category.productCount === 1 ? 'product' : 'products'}
              </p>
            </div>
            <ArrowUpRight
              className={cx(
                'absolute right-4 top-4 size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5',
                index % 4 === 0 ? 'text-gold-300' : 'text-slate-warm',
              )}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ProductRail({
  eyebrow,
  title,
  description,
  products,
  href,
  loading,
  tone,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  products: ProductCardData[];
  href: string;
  loading?: boolean;
  tone?: 'default' | 'sand';
}) {
  return (
    <section className={cx('mt-12 py-10 sm:mt-16 sm:py-12', tone === 'sand' && 'bg-white/70')}>
      <div className="container-page">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
            <h2 className="text-2xl font-bold sm:text-[28px]">{title}</h2>
            {description && <p className="mt-1.5 max-w-xl text-sm text-slate-warm">{description}</p>}
          </div>
          <Link
            to={href}
            className="group flex items-center gap-1.5 text-sm font-semibold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
          >
            View all
            <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : products.length ? (
          <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {products.slice(0, 8).map((product, index) => (
              <div key={product.id} className="min-w-[68%] snap-start sm:min-w-0">
                <ProductCard product={product} priority={index < 2} />
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center text-sm text-slate-warm">
            Nothing here yet. Check back soon.
          </p>
        )}
      </div>
    </section>
  );
}

export function PromoBanners({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section className="container-page mt-12 sm:mt-16">
      <div className={cx('grid gap-4', banners.length > 1 ? 'lg:grid-cols-2' : '')}>
        {banners.slice(0, 2).map((banner, index) => (
          <Link
            key={banner.id}
            to={banner.linkUrl}
            className={cx(
              'group relative flex min-h-[240px] items-end overflow-hidden rounded-2xl sm:min-h-[300px]',
              index === 0 && banners.length > 1 ? 'lg:min-h-[340px]' : '',
            )}
          >
            {banner.imageUrl && (
              <img
                src={banner.imageUrl}
                alt={banner.title}
                loading="lazy"
                className="absolute inset-0 size-full object-cover transition duration-700 group-hover:scale-[1.03]"
              />
            )}
            <div
              className={cx(
                'absolute inset-0',
                banner.theme === 'gold'
                  ? 'bg-gradient-to-t from-brand-950/85 via-brand-950/30 to-transparent'
                  : 'bg-gradient-to-t from-brand-950/90 via-brand-950/35 to-transparent',
              )}
            />
            <div className="relative z-10 p-6 sm:p-8">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-300">{banner.eyebrow}</p>
              <h3 className="mt-2 max-w-sm font-display text-xl font-bold leading-tight text-white sm:text-2xl">
                {banner.title}
              </h3>
              <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-white/70">{banner.subtitle}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white">
                {banner.linkLabel}
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function BrandStrip({ brands }: { brands: Brand[] }) {
  if (!brands.length) return null;
  return (
    <section className="container-page mt-12 sm:mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Trusted labels</p>
          <h2 className="text-2xl font-bold sm:text-[28px]">Brands our customers ask for</h2>
        </div>
        <Link to="/products" className="text-sm font-semibold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4">
          Shop all brands
        </Link>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            to={`/products?brand=${brand.slug}`}
            className="group flex flex-col items-center justify-center rounded-xl border border-line bg-white px-4 py-6 text-center transition hover:border-brand-900/25 hover:shadow-soft"
          >
            <span className="font-display text-lg font-extrabold tracking-tight text-brand-900 group-hover:text-brand-600">
              {brand.name}
            </span>
            <span className="mt-0.5 text-[10.5px] uppercase tracking-wide text-slate-warm">
              {brand.productCount} products
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Testimonials({ testimonials }: { testimonials: Testimonial[] }) {
  if (!testimonials.length) return null;
  return (
    <section className="mt-12 bg-brand-950 py-14 sm:mt-16">
      <div className="container-page">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-gold-400">Customer stories</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-[30px]">
            Bought, used and recommended
          </h2>
          <p className="mt-2 text-sm text-white/55">
            Verified reviews from shoppers across Ethiopia. No incentives, just honest feedback.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {testimonials.slice(0, 3).map((review) => (
            <figure
              key={review.id}
              className="relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
            >
              <Quote className="absolute right-5 top-5 size-6 text-gold-500/20" />
              <Stars value={review.rating} size={14} />
              <blockquote className="mt-3 flex-1 text-[13.5px] leading-relaxed text-white/80">
                “{review.body}”
              </blockquote>
              <figcaption className="mt-4 border-t border-white/10 pt-3">
                <p className="text-[13px] font-semibold text-white">{review.reviewerName}</p>
                {review.product && (
                  <Link
                    to={`/product/${review.product.slug}`}
                    className="mt-0.5 block truncate text-[11.5px] text-gold-300/80 hover:text-gold-200"
                  >
                    {review.product.name}
                  </Link>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RecentlyViewedRail() {
  const items = useRecentlyViewed((state) => state.items);
  if (items.length < 2) return null;
  return (
    <section className="container-page mt-12 sm:mt-16">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <p className="eyebrow mb-2">Pick up where you left off</p>
          <h2 className="text-2xl font-bold sm:text-[26px]">Recently viewed</h2>
        </div>
        <span className="text-xs text-slate-warm">{items.length} products</span>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4 sm:px-0 lg:grid-cols-6">
        {items.slice(0, 6).map((item) => (
          <Link
            key={item.id}
            to={`/product/${item.slug}`}
            className="group min-w-[44%] sm:min-w-0"
          >
            <div className="aspect-square overflow-hidden rounded-xl bg-sand">
              {item.imageUrl && (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  loading="lazy"
                  className="size-full object-cover transition group-hover:scale-105"
                />
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-[12.5px] font-semibold leading-snug text-brand-900">{item.name}</p>
            <p className="mt-0.5 text-[11.5px] font-medium text-slate-warm">{formatSantim(item.priceSantim)}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function CountLabel({ count }: { count: number }) {
  return <>{formatCount(count)}</>;
}
