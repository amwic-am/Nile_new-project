import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BadgeCheck,
  ChevronRight,
  Heart,
  Home,
  Package,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  ZoomIn,
} from 'lucide-react';
import { ProductCard } from '@/components/product/ProductCard';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  QuantityStepper,
  Skeleton,
  Stars,
  Textarea,
} from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { cx, discountPercent, formatCount, formatSantim, relativeDate } from '@/lib/format';
import { queryKeys, useAddToCart, useProduct, useReviews, useSite } from '@/lib/queries';
import { breadcrumbJsonLd, useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useRecentlyViewed } from '@/stores/recently-viewed';
import { useToasts } from '@/stores/toasts';
import { useWishlist } from '@/stores/wishlist';

const reviewSchema = z.object({
  rating: z.number().min(1, 'Choose a rating').max(5),
  title: z.string().trim().max(110, 'Keep the title under 110 characters').optional(),
  body: z.string().trim().min(10, 'Share at least 10 characters').max(2000, 'Keep it under 2,000 characters'),
});

type ReviewForm = z.infer<typeof reviewSchema>;

export default function ProductDetailPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { data, isLoading, isError } = useProduct(slug);
  const product = data?.product;
  const { data: site } = useSite();
  const addToCart = useAddToCart();
  const push = useToasts((state) => state.push);
  const user = useAuth((state) => state.user);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const recordViewed = useRecentlyViewed((state) => state.record);
  const wished = useWishlist((state) => (product ? state.slugs.includes(product.slug) : false));
  const toggleWishlist = useWishlist((state) => state.toggle);

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [tab, setTab] = useState<'description' | 'specs' | 'reviews' | 'delivery'>('description');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewRating, setReviewRating] = useState<number | undefined>(undefined);
  const [adding, setAdding] = useState(false);

  const matchedVariant = useMemo(() => {
    if (!product) return null;
    return (
      product.variants.find((variant) =>
        product.options.every((option) => variant.optionValues[option.name] === selected[option.name]),
      ) ?? null
    );
  }, [product, selected]);

  useEffect(() => {
    if (!product) return;
    const initial = product.variants.find((variant) => variant.inStock) ?? product.variants[0];
    if (initial) setSelected(initial.optionValues);
    setQuantity(1);
    setActiveImage(0);
    recordViewed({
      id: product.id,
      slug: product.slug,
      name: product.name,
      imageUrl: product.images[0]?.url ?? null,
      priceSantim: product.priceSantim,
      compareAtPriceSantim: product.compareAtPriceSantim,
    });
  }, [product, recordViewed]);

  useEffect(() => {
    if (location.hash === '#reviews') setTab('reviews');
  }, [location.hash]);

  useEffect(() => {
    if (product) {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
  }, [product?.id]);

  useSeo({
    title: product?.metaTitle || (product ? `${product.name} | Nile Mart` : 'Product | Nile Mart'),
    description:
      product?.metaDescription ||
      product?.shortDescription ||
      'Shop genuine products at Nile Mart with delivery across Ethiopia.',
    canonicalPath: product ? `/product/${product.slug}` : undefined,
    image: product?.images[0]?.url ?? null,
    type: 'product',
    jsonLd:
      product && site
        ? [
            {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: product.name,
              description: product.shortDescription,
              sku: product.sku,
              image: product.images.map((image) => new URL(image.url, window.location.origin).toString()),
              brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
              category: product.category?.name,
              aggregateRating:
                product.reviewSummary.total > 0
                  ? {
                      '@type': 'AggregateRating',
                      ratingValue: product.reviewSummary.average,
                      reviewCount: product.reviewSummary.total,
                    }
                  : undefined,
              offers: {
                '@type': 'Offer',
                url: new URL(`/product/${product.slug}`, window.location.origin).toString(),
                priceCurrency: 'ETB',
                price: (product.priceSantim / 100).toFixed(2),
                availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                seller: { '@type': 'Organization', name: 'Nile Mart' },
              },
            },
            breadcrumbJsonLd([
              { name: 'Home', path: '/' },
              { name: 'Shop', path: '/products' },
              ...product.breadcrumbs.map((item) => ({ name: item.name, path: `/category/${item.slug}` })),
              { name: product.name, path: `/product/${product.slug}` },
            ]),
          ]
        : null,
  });

  if (isLoading) {
    return <ProductDetailSkeleton />;
  }

  if (isError || !product) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Package className="size-6" />}
          title="This product is not available"
          description="It may have been removed or the link is incorrect."
          action={<Button onClick={() => navigate('/products')}>Browse all products</Button>}
        />
      </div>
    );
  }

  const price = matchedVariant?.priceSantim ?? product.priceSantim;
  const compareAt = matchedVariant?.compareAtPriceSantim ?? product.compareAtPriceSantim;
  const discount = discountPercent(price, compareAt);
  const available = matchedVariant ? matchedVariant.available : product.availableTotal;
  const inStock = available > 0;
  const lowStock = inStock && available <= 3;
  const maxQuantity = Math.max(1, Math.min(99, available));

  const chooseOption = (optionName: string, value: string) => {
    const nextSelected = { ...selected, [optionName]: value };
    setSelected(nextSelected);
    setQuantity(1);
    const variant = product.variants.find((item) =>
      product.options.every((option) => item.optionValues[option.name] === nextSelected[option.name]),
    );
    const imageIndex = variant?.imageUrl
      ? product.images.findIndex((image) => image.url === variant.imageUrl)
      : -1;
    if (imageIndex >= 0) setActiveImage(imageIndex);
  };

  const optionValueAvailable = (optionName: string, value: string) =>
    product.variants.some((variant) => {
      if (variant.optionValues[optionName] !== value) return false;
      return product.options.every((option) => {
        if (option.name === optionName) return true;
        const chosen = selected[option.name];
        return !chosen || variant.optionValues[option.name] === chosen;
      });
    });

  const ensureAuth = () => {
    if (user) return true;
    push('Sign in to continue.', 'info');
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
    return false;
  };

  const handleAdd = async (goToCheckout = false) => {
    if (!matchedVariant || !inStock) {
      push('Choose an available option first.', 'error');
      return;
    }
    setAdding(true);
    try {
      await addToCart.mutateAsync({ variantId: matchedVariant.id, quantity });
      push(`${quantity} × ${product.name} added to your cart.`);
      if (goToCheckout) {
        if (user) {
          navigate('/checkout');
        } else {
          push('Sign in to finish checkout. Your cart is saved.', 'info');
          navigate(`/login?next=${encodeURIComponent('/checkout')}`);
        }
      }
    } catch (error) {
      push(errorMessage(error), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleWishlist = async () => {
    if (!ensureAuth()) return;
    try {
      const added = await toggleWishlist(product.slug);
      push(added ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    } catch (error) {
      push(errorMessage(error), 'error');
    }
  };

  const openReview = () => {
    if (!ensureAuth()) return;
    setReviewOpen(true);
  };

  const related = product.related;
  const threshold = site?.freeShippingThreshold ?? 300000;

  return (
    <div className="container-page pt-5 sm:pt-7">
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-warm" aria-label="Breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-brand-900">
          <Home className="size-3.5" /> Home
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/products" className="hover:text-brand-900">
          Shop
        </Link>
        {product.breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1.5">
            <ChevronRight className="size-3" />
            <Link to={`/category/${crumb.slug}`} className="hover:text-brand-900">
              {crumb.name}
            </Link>
          </span>
        ))}
        <ChevronRight className="size-3" />
        <span className="max-w-[200px] truncate font-medium text-brand-900">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <div className="group relative aspect-square overflow-hidden rounded-2xl bg-sand">
            {product.images[activeImage]?.url ? (
              <img
                src={product.images[activeImage].url}
                alt={product.images[activeImage].alt}
                className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                {...{ fetchpriority: 'high' }}
              />
            ) : (
              <div className="grid size-full place-items-center text-sm text-slate-warm">Image coming soon</div>
            )}
            <button
              type="button"
              onClick={() => setLightbox(true)}
              className="absolute bottom-3 right-3 grid size-10 place-items-center rounded-full bg-white/90 text-brand-900 shadow-sm backdrop-blur transition hover:bg-white"
              aria-label="Open image preview"
            >
              <ZoomIn className="size-4" />
            </button>
            <div className="absolute left-3 top-3 flex flex-col gap-1.5">
              {discount != null && <Badge tone="red">Save {discount}%</Badge>}
              {product.isFeatured && <Badge tone="gold">Featured</Badge>}
            </div>
          </div>

          {product.images.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
              {product.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={cx(
                    'aspect-square w-20 shrink-0 overflow-hidden rounded-xl border-2 transition',
                    activeImage === index ? 'border-brand-900' : 'border-transparent hover:border-line',
                  )}
                  aria-label={`View image ${index + 1}`}
                >
                  <img src={image.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: <Truck className="size-4" />, title: 'Fast delivery', copy: 'Addis & regions' },
              { icon: <ShieldCheck className="size-4" />, title: 'Genuine', copy: 'Authorised source' },
              { icon: <RotateCcw className="size-4" />, title: '7-day returns', copy: 'Simple process' },
            ].map((item) => (
              <div key={item.title} className="rounded-xl border border-line bg-white px-2 py-3">
                <span className="mx-auto mb-1.5 grid size-8 place-items-center rounded-lg bg-cream text-brand-800">
                  {item.icon}
                </span>
                <p className="text-[11.5px] font-semibold text-brand-900">{item.title}</p>
                <p className="text-[10.5px] text-slate-warm">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              {product.brand && (
                <Link
                  to={`/products?brand=${product.brand.slug}`}
                  className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-warm transition hover:text-brand-900"
                >
                  {product.brand.name}
                </Link>
              )}
              <h1 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight text-brand-900 sm:text-[32px]">
                {product.name}
              </h1>
            </div>
            <button
              type="button"
              onClick={handleWishlist}
              aria-pressed={wished}
              className={cx(
                'mt-1 grid size-11 shrink-0 place-items-center rounded-full border transition',
                wished
                  ? 'border-red-200 bg-red-50 text-red-600'
                  : 'border-line bg-white text-brand-900 hover:border-brand-900/30',
              )}
              aria-label={wished ? 'Remove from wishlist' : 'Save to wishlist'}
            >
              <Heart className={cx('size-5', wished && 'fill-current')} />
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <a href="#reviews" onClick={() => setTab('reviews')} className="flex items-center gap-1.5">
              <Stars value={product.reviewSummary.average} size={15} />
              <span className="text-[12.5px] font-medium text-brand-900">
                {product.reviewSummary.total > 0 ? product.reviewSummary.average.toFixed(1) : 'New'}
              </span>
              <span className="text-[12px] text-slate-warm">
                ({formatCount(product.reviewSummary.total)} reviews)
              </span>
            </a>
            <span className="h-3 w-px bg-line" />
            <span className="text-[12px] text-slate-warm">{formatCount(product.soldCount)} sold</span>
            <span className="h-3 w-px bg-line" />
            <span className="text-[12px] text-slate-warm">SKU {product.sku}</span>
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-slate-warm">{product.shortDescription}</p>

          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="font-display text-[30px] font-extrabold text-brand-900">{formatSantim(price)}</span>
            {compareAt && compareAt > price && (
              <>
                <span className="pb-1 text-sm text-slate-warm line-through">{formatSantim(compareAt)}</span>
                <span className="pb-1 text-[12px] font-bold text-red-600">
                  You save {formatSantim(compareAt - price)}
                </span>
              </>
            )}
          </div>
          <p className="mt-1 text-[11.5px] text-slate-warm">Price includes VAT. Delivery calculated at checkout.</p>

          <div className="mt-4">
            {inStock ? (
              lowStock ? (
                <p className="inline-flex items-center gap-2 rounded-lg bg-gold-50 px-3 py-1.5 text-[12px] font-semibold text-gold-800">
                  <span className="size-1.5 rounded-full bg-gold-500" /> Only {available} left in stock
                </p>
              ) : (
                <p className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" /> In stock and ready to ship
                </p>
              )
            ) : (
              <p className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-700">
                <span className="size-1.5 rounded-full bg-red-500" /> Currently out of stock
              </p>
            )}
          </div>

          {product.options.map((option) => (
            <fieldset key={option.id} className="mt-5">
              <legend className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                {option.name}
                <span className="font-medium normal-case tracking-normal text-brand-900">
                  {selected[option.name]}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const active = selected[option.name] === value.value;
                  const availableValue = optionValueAvailable(option.name, value.value);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => chooseOption(option.name, value.value)}
                      disabled={!availableValue}
                      className={cx(
                        'min-w-11 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition',
                        active
                          ? 'border-brand-900 bg-brand-900 text-white'
                          : availableValue
                            ? 'border-line bg-white text-brand-900 hover:border-brand-900/40'
                            : 'cursor-not-allowed border-line bg-cream text-slate-warm/40 line-through',
                      )}
                      aria-pressed={active}
                    >
                      {value.value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <QuantityStepper value={quantity} onChange={setQuantity} max={maxQuantity} />
            <span className="text-[11.5px] text-slate-warm">
              {matchedVariant ? `${available} available` : 'Select an option'}
            </span>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <Button
              size="lg"
              onClick={() => void handleAdd(false)}
              loading={adding}
              disabled={!inStock}
              iconLeft={<ShoppingBag className="size-4" />}
            >
              Add to cart
            </Button>
            <Button
              size="lg"
              variant="gold"
              onClick={() => void handleAdd(true)}
              disabled={!inStock}
              iconRight={<ChevronRight className="size-4" />}
            >
              Buy now
            </Button>
          </div>

          <div className="mt-5 space-y-2.5 rounded-2xl border border-line bg-white p-4">
            <DeliveryRow
              icon={<Truck className="size-4" />}
              title="Delivery"
              copy={`Standard 2-4 days · ${formatSantim(15000)}. Free over ${formatSantim(threshold)}.`}
            />
            <DeliveryRow
              icon={<Store className="size-4" />}
              title="Click & collect"
              copy="Ready in 2 hours at our Bole Road store, free of charge."
            />
            <DeliveryRow
              icon={<BadgeCheck className="size-4" />}
              title="Warranty & returns"
              copy={`${product.warrantyInfo || 'Manufacturer warranty applies'}. ${product.returnInfo || '7-day returns on unused items.'}`}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-warm">
            <span className="rounded-md border border-line bg-white px-2 py-1">Cash on delivery</span>
            <span className="rounded-md border border-line bg-white px-2 py-1">Chapa</span>
            <span className="rounded-md border border-line bg-white px-2 py-1">Telebirr</span>
            <span className="rounded-md border border-line bg-white px-2 py-1">Cards</span>
          </div>
        </div>
      </div>

      <section className="mt-12 rounded-2xl border border-line bg-white">
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line px-3 pt-2 sm:px-5">
          {[
            { id: 'description', label: 'Description' },
            { id: 'specs', label: 'Specifications' },
            { id: 'reviews', label: `Reviews (${product.reviewSummary.total})` },
            { id: 'delivery', label: 'Delivery & returns' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={cx(
                'relative whitespace-nowrap px-3.5 py-3 text-[13px] font-semibold transition sm:px-4',
                tab === item.id ? 'text-brand-900' : 'text-slate-warm hover:text-brand-900',
              )}
            >
              {item.label}
              {tab === item.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gold-500" />}
            </button>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          {tab === 'description' && (
            <div className="max-w-3xl space-y-3.5 text-[14px] leading-relaxed text-slate-warm">
              {product.description.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
              {product.attributes.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {product.attributes.slice(0, 8).map((attribute) => (
                    <span
                      key={`${attribute.name}-${attribute.value}`}
                      className="rounded-full border border-line bg-cream px-3 py-1.5 text-[11.5px] font-medium text-brand-900"
                    >
                      {attribute.name}: {attribute.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'specs' && (
            <div className="max-w-2xl overflow-hidden rounded-xl border border-line">
              {product.specs.length === 0 && product.attributes.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-warm">No specifications listed for this product yet.</p>
              ) : (
                <dl className="divide-y divide-line text-[13px]">
                  {product.specs.map((spec) => (
                    <div key={spec.label} className="grid grid-cols-[40%_1fr] gap-3 px-4 py-2.5 even:bg-cream/50">
                      <dt className="font-medium text-slate-warm">{spec.label}</dt>
                      <dd className="text-brand-900">{spec.value}</dd>
                    </div>
                  ))}
                  {product.attributes.map((attribute) => (
                    <div
                      key={`${attribute.name}-${attribute.value}`}
                      className="grid grid-cols-[40%_1fr] gap-3 px-4 py-2.5 even:bg-cream/50"
                    >
                      <dt className="font-medium text-slate-warm">{attribute.name}</dt>
                      <dd className="text-brand-900">{attribute.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {tab === 'reviews' && (
            <ReviewsSection
              slug={slug}
              summary={product.reviewSummary}
              reviewPage={reviewPage}
              reviewRating={reviewRating}
              onPage={setReviewPage}
              onRating={(rating) => {
                setReviewRating(rating);
                setReviewPage(1);
              }}
              onWrite={openReview}
            />
          )}

          {tab === 'delivery' && (
            <div className="grid max-w-4xl gap-5 text-[13.5px] leading-relaxed text-slate-warm sm:grid-cols-2">
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold text-brand-900">Delivery options</h3>
                <ul className="space-y-2">
                  <li>Standard delivery: 2-4 business days, ETB 150.</li>
                  <li>Express delivery in Addis Ababa: next business day, ETB 300.</li>
                  <li>Click & collect at Bole Road: ready in 2 hours, free.</li>
                  <li>Free standard delivery on orders above ETB 3,000 after discounts.</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-sans text-sm font-bold text-brand-900">Returns</h3>
                <p>
                  {site?.returns.summary ??
                    'Unused items in their original packaging can be returned within 7 days of delivery.'}
                </p>
                <Link
                  to="/returns"
                  className="mt-3 inline-block text-[12.5px] font-semibold text-brand-900 underline decoration-gold-400 underline-offset-4"
                >
                  Read the full returns policy
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="eyebrow mb-2">Complete the set</p>
              <h2 className="text-2xl font-bold">You may also like</h2>
            </div>
            <Link
              to={`/category/${product.category?.slug ?? 'all'}`}
              className="text-sm font-semibold text-brand-900 underline decoration-gold-400 underline-offset-4"
            >
              More in {product.category?.name ?? 'this category'}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      <MobileBuyBar
        price={price}
        inStock={inStock}
        loading={adding}
        onAdd={() => void handleAdd(false)}
        onBuy={() => void handleAdd(true)}
      />

      <Modal open={lightbox} onClose={() => setLightbox(false)} title={product.name} size="lg">
        <div className="overflow-hidden rounded-xl bg-sand">
          {product.images[activeImage]?.url && (
            <img
              src={product.images[activeImage].url}
              alt={product.images[activeImage].alt}
              className="max-h-[70vh] w-full object-contain"
            />
          )}
        </div>
      </Modal>

      <ReviewModal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        slug={slug}
        onSubmitted={async () => {
          setReviewOpen(false);
          setReviewPage(1);
          setReviewRating(undefined);
          setTab('reviews');
          await queryClient.invalidateQueries({ queryKey: ['reviews', slug] });
          await queryClient.invalidateQueries({ queryKey: queryKeys.product(slug) });
        }}
      />
    </div>
  );
}

function DeliveryRow({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-cream text-brand-800">{icon}</span>
      <p className="text-[12px] leading-relaxed text-slate-warm">
        <span className="font-semibold text-brand-900">{title}: </span>
        {copy}
      </p>
    </div>
  );
}

function ReviewsSection({
  slug,
  summary,
  reviewPage,
  reviewRating,
  onPage,
  onRating,
  onWrite,
}: {
  slug: string;
  summary: { average: number; total: number; distribution: { rating: number; count: number }[] };
  reviewPage: number;
  reviewRating?: number;
  onPage: (page: number) => void;
  onRating: (rating?: number) => void;
  onWrite: () => void;
}) {
  const { data, isLoading } = useReviews(slug, reviewPage, reviewRating);
  const total = data?.summary.total ?? summary.total;

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div>
        <div className="rounded-2xl bg-cream p-5 text-center">
          <p className="font-display text-4xl font-extrabold text-brand-900">
            {(data?.summary.average ?? summary.average).toFixed(1)}
          </p>
          <Stars value={data?.summary.average ?? summary.average} size={16} className="mt-1 justify-center" />
          <p className="mt-1 text-[12px] text-slate-warm">Based on {total} reviews</p>
        </div>
        <div className="mt-4 space-y-1.5">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = summary.distribution.find((item) => item.rating === rating)?.count ?? 0;
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <button
                key={rating}
                type="button"
                onClick={() => onRating(reviewRating === rating ? undefined : rating)}
                className={cx(
                  'flex w-full items-center gap-2 rounded-lg px-1 py-1 text-[11.5px] transition hover:bg-cream',
                  reviewRating === rating && 'bg-cream',
                )}
              >
                <span className="w-7 text-left text-slate-warm">{rating}★</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
                  <span className="block h-full rounded-full bg-gold-500" style={{ width: `${percent}%` }} />
                </span>
                <span className="w-6 text-right text-slate-warm">{count}</span>
              </button>
            );
          })}
        </div>
        <Button variant="outline" fullWidth className="mt-4" onClick={onWrite}>
          Write a review
        </Button>
        {reviewRating && (
          <button
            type="button"
            onClick={() => onRating(undefined)}
            className="mt-2 block w-full text-center text-[11.5px] font-semibold text-slate-warm underline underline-offset-2"
          >
            Show all ratings
          </button>
        )}
      </div>

      <div>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : data && data.items.length > 0 ? (
          <div className="space-y-5">
            {data.items.map((review) => (
              <article key={review.id} className="border-b border-line/70 pb-5 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={review.rating} size={13} />
                  {review.verifiedPurchase && <Badge tone="green">Verified purchase</Badge>}
                  <span className="ml-auto text-[11.5px] text-slate-warm">{relativeDate(review.createdAt)}</span>
                </div>
                {review.title && <h3 className="mt-2 font-sans text-[14px] font-bold text-brand-900">{review.title}</h3>}
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-warm">{review.body}</p>
                <p className="mt-2 text-[11.5px] font-medium text-brand-900">— {review.reviewerName}</p>
                {review.adminReply && (
                  <div className="mt-3 rounded-xl border border-line bg-cream/70 px-4 py-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gold-700">Nile Mart reply</p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-warm">{review.adminReply}</p>
                  </div>
                )}
              </article>
            ))}
            <Pagination page={data.page} totalPages={data.totalPages} onChange={onPage} />
          </div>
        ) : (
          <EmptyState
            icon={<BadgeCheck className="size-6" />}
            title={reviewRating ? `No ${reviewRating}-star reviews yet` : 'No reviews yet'}
            description="Be the first to share your experience with this product."
            action={<Button onClick={onWrite}>Write a review</Button>}
          />
        )}
      </div>
    </div>
  );
}

function ReviewModal({
  open,
  onClose,
  slug,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  slug: string;
  onSubmitted: () => Promise<void>;
}) {
  const [rating, setRating] = useState(5);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: 5, title: '', body: '' },
  });

  useEffect(() => {
    if (open) {
      setRating(5);
      setError('');
      reset({ rating: 5, title: '', body: '' });
    }
  }, [open, reset]);

  const submit = handleSubmit(async (values) => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/products/${encodeURIComponent(slug)}/reviews`, {
        rating,
        title: values.title ?? '',
        body: values.body,
      });
      await onSubmitted();
    } catch (caught) {
      const fields = fieldErrors(caught);
      setError(fields.body ?? fields.title ?? errorMessage(caught));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Write a review">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <p className="label">Your rating</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                className="text-gold-500"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-7"
                  fill={value <= rating ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z" />
                </svg>
              </button>
            ))}
          </div>
          {rating === 0 && <p className="mt-1 text-xs text-red-600">Choose a rating</p>}
        </div>

        <Field label="Title (optional)" error={errors.title?.message}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              placeholder="Sum it up in a few words"
              invalid={Boolean(errors.title)}
              {...register('title')}
            />
          )}
        </Field>

        <Field label="Your review" error={errors.body?.message}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={5}
              placeholder="What did you like or dislike? How did you use it?"
              invalid={Boolean(errors.body)}
              {...register('body')}
            />
          )}
        </Field>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{error}</p>}
        <p className="text-[11px] text-slate-warm">
          Reviews are moderated before publishing. Only customers who bought and received the item are marked as
          verified.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Submit review
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MobileBuyBar({
  price,
  inStock,
  loading,
  onAdd,
  onBuy,
}: {
  price: number;
  inStock: boolean;
  loading: boolean;
  onAdd: () => void;
  onBuy: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-warm">Total</p>
          <p className="font-display text-lg font-extrabold text-brand-900">{formatSantim(price)}</p>
        </div>
        <Button
          className="flex-1"
          size="md"
          variant="outline"
          onClick={onAdd}
          loading={loading}
          disabled={!inStock}
        >
          Add to cart
        </Button>
        <Button className="flex-1" size="md" variant="gold" onClick={onBuy} disabled={!inStock}>
          Buy now
        </Button>
      </div>
    </div>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="container-page pt-7">
      <Skeleton className="h-4 w-64" />
      <div className="mt-5 grid gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="mt-3 flex gap-2.5">
            <Skeleton className="size-20 rounded-xl" />
            <Skeleton className="size-20 rounded-xl" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-4/5" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
