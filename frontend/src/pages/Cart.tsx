import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { Button, ButtonLink, EmptyState, QuantityStepper, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { cx, formatSantim } from '@/lib/format';
import {
  useApplyCoupon,
  useCart,
  useRemoveCartItem,
  useRemoveCoupon,
  useSite,
  useUpdateCartItem,
} from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';

export default function CartPage() {
  const { data, isLoading } = useCart();
  const { data: site } = useSite();
  const user = useAuth((state) => state.user);
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const applyCoupon = useApplyCoupon();
  const removeCoupon = useRemoveCoupon();
  const push = useToasts((state) => state.push);
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState('');

  useSeo({
    title: 'Your cart',
    description: 'Review your Nile Mart cart and check out securely.',
    canonicalPath: '/cart',
    noIndex: true,
  });

  const cart = data?.cart;
  const threshold = cart?.freeShippingThreshold ?? site?.freeShippingThreshold ?? 300000;

  if (isLoading) {
    return (
      <div className="container-page py-10">
        <Skeleton className="h-8 w-48" />
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-14">
        <EmptyState
          icon={<ShoppingBag className="size-6" />}
          title="Your cart is empty"
          description="Browse our latest arrivals, deals and best sellers to find something you love."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/products">Start shopping</ButtonLink>
              <ButtonLink to="/products?deals=1" variant="outline">
                View deals
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  const payable = Math.max(0, cart.subtotal - cart.discount);
  const remaining = Math.max(0, threshold - payable);
  const progress = Math.min(100, Math.round((payable / threshold) * 100));

  const changeQuantity = async (cartItemId: string, quantity: number) => {
    try {
      await updateItem.mutateAsync({ cartItemId, quantity });
    } catch (error) {
      push(errorMessage(error), 'error');
    }
  };

  const remove = async (cartItemId: string, name: string) => {
    try {
      await removeItem.mutateAsync(cartItemId);
      push(`${name} removed from your cart.`);
    } catch (error) {
      push(errorMessage(error), 'error');
    }
  };

  const apply = async () => {
    const code = coupon.trim();
    if (!code) return;
    try {
      await applyCoupon.mutateAsync(code);
      setCoupon('');
      push('Discount code applied.');
    } catch (error) {
      push(errorMessage(error), 'error');
    }
  };

  const goToCheckout = () => {
    if (user) {
      navigate('/checkout');
    } else {
      push('Sign in to complete your order. Your cart is saved.', 'info');
      navigate(`/login?next=${encodeURIComponent('/checkout')}`);
    }
  };

  return (
    <div className="container-page py-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-2">Bag</p>
          <h1 className="text-[26px] font-extrabold sm:text-[32px]">Your cart</h1>
          <p className="mt-1 text-sm text-slate-warm">
            {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} ·{' '}
            <Link to="/products" className="font-medium text-brand-900 underline decoration-gold-400 underline-offset-4">
              continue shopping
            </Link>
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
          <ShieldCheck className="size-3.5" /> Secure server-priced checkout
        </span>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_370px]">
        <div>
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            {cart.items.map((item, index) => (
              <div
                key={item.cartItemId}
                className={cx(
                  'flex gap-3.5 p-4 sm:gap-5 sm:p-5',
                  index > 0 && 'border-t border-line',
                  (item.unavailable || item.stockIssue) && 'bg-red-50/40',
                )}
              >
                <Link
                  to={`/product/${item.slug}`}
                  className="size-24 shrink-0 overflow-hidden rounded-xl bg-sand sm:size-28"
                >
                  {item.imageUrl && (
                    <img src={item.imageUrl} alt={item.name} className="size-full object-cover" loading="lazy" />
                  )}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {item.brandName && (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-warm">
                          {item.brandName}
                        </p>
                      )}
                      <Link
                        to={`/product/${item.slug}`}
                        className="mt-0.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-brand-900 hover:text-brand-600"
                      >
                        {item.name}
                      </Link>
                      {item.variantLabel && (
                        <p className="mt-1 text-[11.5px] text-slate-warm">{item.variantLabel}</p>
                      )}
                      <p className="mt-0.5 text-[10.5px] text-slate-warm/80">SKU {item.sku}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(item.cartItemId, item.name)}
                      disabled={removeItem.isPending}
                      className="grid size-8 shrink-0 place-items-center rounded-full text-slate-warm transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>

                  {item.priceChanged && item.priceWhenAdded != null && (
                    <p className="mt-1.5 rounded-md bg-gold-50 px-2 py-1 text-[10.5px] font-medium text-gold-800">
                      Price updated since you added this item.
                    </p>
                  )}
                  {item.stockIssue && (
                    <p className="mt-1.5 rounded-md bg-red-100 px-2 py-1 text-[10.5px] font-semibold text-red-700">
                      {item.stockIssue}
                    </p>
                  )}

                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-3">
                    <QuantityStepper
                      value={item.quantity}
                      onChange={(quantity) => void changeQuantity(item.cartItemId, quantity)}
                      max={Math.max(1, item.maxQuantity)}
                      size="sm"
                      label={`Quantity for ${item.name}`}
                    />
                    <div className="text-right">
                      <p className="font-display text-[15px] font-bold text-brand-900">
                        {formatSantim(item.lineTotal)}
                      </p>
                      <p className="text-[10.5px] text-slate-warm">{formatSantim(item.unitPrice)} each</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-900">
                <Truck className="size-4 text-gold-600" />
                {remaining > 0
                  ? `Add ${formatSantim(remaining)} more for free standard delivery`
                  : 'You qualify for free standard delivery'}
              </p>
              <span className="text-[11px] text-slate-warm">{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-sand">
              <div
                className={cx(
                  'h-full rounded-full transition-all',
                  remaining > 0 ? 'bg-gold-500' : 'bg-emerald-500',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[10.5px] text-slate-warm">
              Delivery is calculated at checkout based on your selected method and address.
            </p>
          </div>
        </div>

        <aside>
          <div className="sticky top-[128px] rounded-2xl border border-line bg-white p-5 shadow-soft">
            <h2 className="font-display text-lg font-bold text-brand-900">Order summary</h2>

            <div className="mt-4 space-y-2.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-slate-warm">Subtotal</span>
                <span className="font-semibold text-brand-900">{formatSantim(cart.subtotal)}</span>
              </div>
              {cart.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span className="flex items-center gap-1.5">
                    <Tag className="size-3.5" /> Discount {cart.couponCode ? `(${cart.couponCode})` : ''}
                  </span>
                  <span className="font-semibold">−{formatSantim(cart.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-warm">Delivery</span>
                <span className="text-slate-warm">Calculated at checkout</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-3">
                <span className="font-semibold text-brand-900">Total</span>
                <span className="font-display text-xl font-extrabold text-brand-900">
                  {formatSantim(Math.max(0, cart.subtotal - cart.discount))}
                </span>
              </div>
              <p className="text-right text-[10.5px] text-slate-warm">Excludes delivery. VAT included.</p>
            </div>

            {cart.coupon ? (
              <div className="mt-4 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2.5">
                <div>
                  <p className="text-[12px] font-bold text-emerald-800">{cart.coupon.code}</p>
                  <p className="text-[10.5px] text-emerald-700">{cart.coupon.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removeCoupon.mutateAsync()}
                  className="grid size-6 place-items-center rounded-full text-emerald-700 hover:bg-emerald-100"
                  aria-label="Remove discount code"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <label className="label" htmlFor="coupon">
                  Discount code
                </label>
                <div className="flex gap-2">
                  <input
                    id="coupon"
                    value={coupon}
                    onChange={(event) => setCoupon(event.target.value.toUpperCase())}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void apply();
                    }}
                    placeholder="e.g. WELCOME10"
                    className="field h-10 flex-1 text-[12.5px] uppercase"
                    autoComplete="off"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void apply()}
                    loading={applyCoupon.isPending}
                    disabled={!coupon.trim()}
                  >
                    Apply
                  </Button>
                </div>
                {cart.couponError && <p className="mt-1.5 text-[11px] text-red-600">{cart.couponError}</p>}
              </div>
            )}

            <Button
              fullWidth
              size="lg"
              className="mt-5"
              onClick={goToCheckout}
              disabled={cart.hasIssues}
              iconRight={<ArrowRight className="size-4" />}
            >
              {user ? 'Proceed to checkout' : 'Sign in to checkout'}
            </Button>
            {cart.hasIssues && (
              <p className="mt-2 text-center text-[11px] font-medium text-red-600">
                Resolve the stock issue above before checking out.
              </p>
            )}

            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[11px] text-slate-warm">
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-emerald-600" /> Totals are calculated and verified on our
                server.
              </p>
              <p className="flex items-center gap-2">
                <Truck className="size-3.5 text-gold-600" /> Free standard delivery over {formatSantim(threshold)}.
              </p>
              <p className="flex items-center gap-2">
                <ShoppingBag className="size-3.5 text-brand-700" /> 7-day returns on unused items.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
