import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  Lock,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tag,
  Truck,
} from 'lucide-react';
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/api';
import { cx, formatSantim } from '@/lib/format';
import {
  useCheckoutOverview,
  usePlaceOrder,
  useRemoveCoupon,
} from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import type { Address } from '@/lib/types';
import { useAuth } from '@/stores/auth';

const phonePattern = /^[+0-9 ()-]+$/;

const checkoutFormSchema = z
  .object({
    contact: z.object({
      fullName: z.string().trim().min(2, 'Enter the recipient name').max(100),
      email: z.string().trim().min(5).max(254).email('Enter a valid email address'),
      phone: z
        .string()
        .trim()
        .min(7, 'Enter a phone number')
        .max(30)
        .regex(phonePattern, 'Enter a valid phone number'),
    }),
    shippingAddress: z.object({
      fullName: z.string().trim().max(100),
      phone: z.string().trim().max(30),
      line1: z.string().trim().max(200),
      line2: z.string().trim().max(200),
      city: z.string().trim().max(80),
      region: z.string().trim().max(80),
      postalCode: z.string().trim().max(20),
      country: z.string().trim().length(2),
    }),
    deliveryMethod: z.string().min(2, 'Choose a delivery method'),
    paymentMethod: z.enum(['cod', 'chapa'], { message: 'Choose a payment method' }),
    customerNote: z.string().trim().max(500, 'Keep your note under 500 characters'),
    saveAddress: z.boolean(),
    acceptTerms: z.boolean().refine((value) => value, 'Accept the terms to place your order'),
  })
  .superRefine((values, ctx) => {
    if (values.deliveryMethod === 'pickup') return;
    const address = values.shippingAddress;
    if (address.fullName.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'fullName'], message: 'Enter the recipient name' });
    }
    if (address.phone.trim().length < 7) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'phone'], message: 'Enter a delivery phone number' });
    }
    if (address.line1.trim().length < 3) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'line1'], message: 'Enter the street address' });
    }
    if (address.city.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'city'], message: 'Enter the city' });
    }
    if (address.region.trim().length < 2) {
      ctx.addIssue({ code: 'custom', path: ['shippingAddress', 'region'], message: 'Choose a region' });
    }
  });

type CheckoutForm = z.infer<typeof checkoutFormSchema>;

const STEPS = ['Contact', 'Address', 'Delivery', 'Payment', 'Review'] as const;

const REGIONS = [
  'Addis Ababa',
  'Afar',
  'Amhara',
  'Benishangul-Gumuz',
  'Central Ethiopia',
  'Dire Dawa',
  'Gambella',
  'Harari',
  'Oromia',
  'Sidama',
  'Somali',
  'South Ethiopia',
  'South West Ethiopia',
  'Tigray',
];

const NEW_ADDRESS = 'new';

function emptyAddress(contact?: { fullName: string; phone: string }) {
  return {
    fullName: contact?.fullName ?? '',
    phone: contact?.phone ?? '',
    line1: '',
    line2: '',
    city: 'Addis Ababa',
    region: 'Addis Ababa',
    postalCode: '',
    country: 'ET',
  };
}

function savedAddress(address: Address) {
  return {
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    region: address.region,
    postalCode: address.postalCode ?? '',
    country: address.country || 'ET',
  };
}

function paymentNote(id: string, note?: string | null) {
  if (id === 'cod') return 'Pay the courier in cash when your order arrives.';
  if (id === 'chapa') return 'Cards, Telebirr and M-PESA are handled on Chapa’s secure page.';
  return note || 'This method is not available for your account yet.';
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const user = useAuth((state) => state.user);
  const { data, isLoading, isError, error, refetch, isFetching } = useCheckoutOverview(Boolean(user));
  const placeOrder = usePlaceOrder();
  const removeCoupon = useRemoveCoupon();
  const [step, setStep] = useState(0);
  const [selectedAddressId, setSelectedAddressId] = useState<string>(NEW_ADDRESS);
  const [serverError, setServerError] = useState('');
  const [couponNotice, setCouponNotice] = useState('');
  const hydrated = useRef(false);
  const idempotencyKey = useRef(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `nm-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
  );
  const stepTop = useRef<HTMLDivElement>(null);

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      contact: { fullName: '', email: '', phone: '' },
      shippingAddress: emptyAddress(),
      deliveryMethod: '',
      paymentMethod: 'cod',
      customerNote: '',
      saveAddress: true,
      acceptTerms: false,
    },
    mode: 'onTouched',
  });

  const {
    register,
    watch,
    setValue,
    getValues,
    setError,
    clearErrors,
    reset,
    trigger,
    formState: { errors },
  } = form;

  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const defaultMethod =
      data.deliveryMethods.find((method) => method.id === 'standard') ?? data.deliveryMethods[0];
    const defaultPayment =
      data.paymentOptions.find((option) => option.id === 'cod' && option.available) ??
      data.paymentOptions.find((option) => option.available && option.implemented);
    const defaultAddress =
      data.addresses.find((address) => address.isDefault) ?? data.addresses[0] ?? null;

    reset({
      contact: {
        fullName: data.contact.fullName,
        email: data.contact.email,
        phone: data.contact.phone,
      },
      shippingAddress: defaultAddress ? savedAddress(defaultAddress) : emptyAddress(data.contact),
      deliveryMethod: defaultMethod?.id ?? '',
      paymentMethod: defaultPayment?.id === 'chapa' ? 'chapa' : 'cod',
      customerNote: '',
      saveAddress: !defaultAddress,
      acceptTerms: false,
    });
    if (defaultAddress) setSelectedAddressId(defaultAddress.id);
  }, [data, reset]);

  const contact = watch('contact');
  const shipping = watch('shippingAddress');
  const deliveryMethod = watch('deliveryMethod');
  const paymentMethod = watch('paymentMethod');
  const customerNote = watch('customerNote');
  const acceptTerms = watch('acceptTerms');

  const cart = data?.cart;
  const delivery = data?.deliveryMethods.find((method) => method.id === deliveryMethod) ?? null;
  const payment = data?.paymentOptions.find((option) => option.id === paymentMethod) ?? null;
  const subtotal = cart?.subtotal ?? 0;
  const discount = cart?.discount ?? 0;
  const shippingFee = delivery?.effectiveFee ?? 0;
  const total = Math.max(0, subtotal - discount) + shippingFee;
  const isPickup = deliveryMethod === 'pickup';
  const selectedSaved = data?.addresses.find((address) => address.id === selectedAddressId) ?? null;

  useSeo({
    title: 'Secure checkout',
    description: 'Complete your Nile Mart order with secure server-verified pricing.',
    canonicalPath: '/checkout',
    noIndex: true,
  });

  const totals = useMemo(
    () => ({ subtotal, discount, shippingFee, total }),
    [subtotal, discount, shippingFee, total],
  );

  const goToStep = (next: number) => {
    setServerError('');
    setStep(next);
    window.setTimeout(() => stepTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  const continueFromContact = async () => {
    const valid = await trigger(['contact.fullName', 'contact.email', 'contact.phone']);
    if (valid) goToStep(1);
  };

  const continueFromAddress = async () => {
    if (isPickup) {
      goToStep(2);
      return;
    }
    const valid = await trigger([
      'shippingAddress.fullName',
      'shippingAddress.phone',
      'shippingAddress.line1',
      'shippingAddress.city',
      'shippingAddress.region',
    ]);
    if (valid) goToStep(2);
  };

  const chooseSavedAddress = (address: Address) => {
    setSelectedAddressId(address.id);
    setValue('shippingAddress', savedAddress(address), { shouldValidate: false });
    setValue('saveAddress', false);
    clearErrors('shippingAddress');
  };

  const chooseNewAddress = () => {
    setSelectedAddressId(NEW_ADDRESS);
    setValue('shippingAddress', emptyAddress(contact), { shouldValidate: false });
    setValue('saveAddress', true);
    clearErrors('shippingAddress');
  };

  const submitOrder = async () => {
    setServerError('');
    const valid = await trigger();
    if (!valid) {
      const stepForField = (path: string) => {
        if (path.startsWith('contact')) return 0;
        if (path.startsWith('shippingAddress')) return 1;
        if (path === 'deliveryMethod') return 2;
        if (path === 'paymentMethod') return 3;
        return 4;
      };
      goToStep(stepForField(Object.keys(errors)[0] ?? 'acceptTerms'));
      setServerError('Please complete the highlighted details before placing your order.');
      return;
    }

    const values = getValues();
    try {
      const result = await placeOrder.mutateAsync({
        key: idempotencyKey.current,
        body: {
          contact: values.contact,
          shippingAddress: values.shippingAddress,
          deliveryMethod: values.deliveryMethod,
          paymentMethod: values.paymentMethod,
          couponCode: cart?.couponCode ?? null,
          customerNote: values.customerNote || null,
          saveAddress: values.saveAddress && selectedAddressId === NEW_ADDRESS,
          acceptTerms: true,
        },
      });
      if (result.payment?.redirectUrl) {
        window.location.assign(result.payment.redirectUrl);
        return;
      }
      navigate(`/checkout/success/${result.order.orderId}`, {
        replace: true,
        state: { paymentError: result.paymentError?.message ?? null },
      });
    } catch (caught) {
      const fields = fieldErrors(caught);
      let mapped = false;
      for (const [path, message] of Object.entries(fields)) {
        if (
          path.startsWith('contact.') ||
          path.startsWith('shippingAddress.') ||
          path === 'deliveryMethod' ||
          path === 'paymentMethod' ||
          path === 'acceptTerms'
        ) {
          setError(path as keyof CheckoutForm, { message });
          mapped = true;
        }
      }
      setServerError(
        mapped ? 'Please review the highlighted fields and try again.' : errorMessage(caught),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-8 w-56" />
        <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container-page py-14">
        <EmptyState
          icon={<AlertCircle className="size-6" />}
          title="Checkout could not be loaded"
          description={errorMessage(error)}
          action={
            <Button onClick={() => void refetch()} loading={isFetching}>
              Try again
            </Button>
          }
        />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-14">
        <EmptyState
          icon={<ShoppingBag className="size-6" />}
          title="Your cart is empty"
          description="Add a product to your cart before starting checkout."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink to="/products">Browse products</ButtonLink>
              <ButtonLink to="/products?deals=1" variant="outline">
                Shop deals
              </ButtonLink>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-7">
      <div ref={stepTop} className="scroll-mt-28">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">Secure checkout</p>
            <h1 className="text-[26px] font-extrabold sm:text-[32px]">Complete your order</h1>
            <p className="mt-1 text-sm text-slate-warm">
              {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} ·{' '}
              <Link to="/cart" className="font-medium text-brand-900 underline decoration-gold-400 underline-offset-4">
                edit cart
              </Link>
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
            <Lock className="size-3.5" /> Server-verified totals
          </span>
        </div>

        <ol className="mt-6 flex items-center gap-1 overflow-x-auto pb-1" aria-label="Checkout progress">
          {STEPS.map((label, index) => {
            const complete = index < step;
            const current = index === step;
            return (
              <li key={label} className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (index < step) goToStep(index);
                  }}
                  disabled={index >= step}
                  aria-current={current ? 'step' : undefined}
                  className={cx(
                    'flex items-center gap-2 rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold transition sm:px-3',
                    current
                      ? 'bg-brand-900 text-white'
                      : complete
                        ? 'bg-brand-50 text-brand-900 hover:bg-brand-100'
                        : 'text-slate-warm/70',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-5 place-items-center rounded-full text-[10px]',
                      current
                        ? 'bg-white/20 text-white'
                        : complete
                          ? 'bg-brand-900 text-white'
                          : 'bg-sand text-slate-warm',
                    )}
                  >
                    {complete ? <Check className="size-3" /> : index + 1}
                  </span>
                  {label}
                </button>
                {index < STEPS.length - 1 && <span className="h-px w-4 bg-line sm:w-7" aria-hidden />}
              </li>
            );
          })}
        </ol>
      </div>

      {!data?.emailVerified && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3 text-[12px] text-gold-900">
          <p className="flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0 text-gold-700" />
            Verify your email so we can send receipts and order updates.
          </p>
          <Link to="/verify-email" className="font-semibold underline underline-offset-2">
            Verify email
          </Link>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_370px] lg:items-start">
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          {step === 0 && (
            <section className="p-5 sm:p-7" aria-labelledby="step-contact">
              <StepHeading
                index={1}
                title="Contact details"
                description="We use these details for order updates and delivery coordination."
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Full name" error={errors.contact?.fullName?.message}>
                    {({ id, describedBy }) => (
                      <Input
                        id={id}
                        autoComplete="name"
                        aria-describedby={describedBy}
                        invalid={Boolean(errors.contact?.fullName)}
                        {...register('contact.fullName')}
                      />
                    )}
                  </Field>
                </div>
                <Field label="Email address" error={errors.contact?.email?.message}>
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      type="email"
                      autoComplete="email"
                      aria-describedby={describedBy}
                      invalid={Boolean(errors.contact?.email)}
                      {...register('contact.email')}
                    />
                  )}
                </Field>
                <Field label="Phone number" error={errors.contact?.phone?.message} hint="Include your country code.">
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      type="tel"
                      autoComplete="tel"
                      placeholder="+251 911 234 567"
                      aria-describedby={describedBy}
                      invalid={Boolean(errors.contact?.phone)}
                      {...register('contact.phone')}
                    />
                  )}
                </Field>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <ButtonLink to="/cart" variant="ghost" iconLeft={<ArrowLeft className="size-4" />}>
                  Back to cart
                </ButtonLink>
                <Button onClick={() => void continueFromContact()} iconRight={<ArrowRight className="size-4" />}>
                  Continue to address
                </Button>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="p-5 sm:p-7" aria-labelledby="step-address">
              <StepHeading
                index={2}
                title={isPickup ? 'Store pickup' : 'Delivery address'}
                description={
                  isPickup
                    ? 'Collect your order from our Bole Road store. We will notify you when it is ready.'
                    : 'Choose a saved address or enter a new delivery address.'
                }
              />
              {isPickup ? (
                <div className="mt-5 flex gap-3 rounded-xl border border-line bg-cream p-4">
                  <Store className="mt-0.5 size-5 shrink-0 text-brand-900" />
                  <div className="text-[13px] leading-relaxed text-slate-warm">
                    <p className="font-semibold text-brand-900">{data?.store.name ?? 'Nile Mart'} store</p>
                    <p>{data?.store.address}</p>
                    <p className="mt-1">{data?.store.phone}</p>
                    <p className="mt-2 text-[12px]">Bring your order number and a valid ID when collecting.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {(data?.addresses.length ?? 0) > 0 && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {data?.addresses.map((address) => {
                        const selected = selectedAddressId === address.id;
                        return (
                          <label
                            key={address.id}
                            className={cx(
                              'cursor-pointer rounded-xl border p-4 transition',
                              selected
                                ? 'border-brand-900 bg-brand-50/50 ring-1 ring-brand-900/10'
                                : 'border-line hover:border-brand-900/30',
                            )}
                          >
                            <span className="flex items-start justify-between gap-2">
                              <span className="flex items-center gap-2 text-[12px] font-bold text-brand-900">
                                <input
                                  type="radio"
                                  name="saved-address"
                                  className="sr-only"
                                  checked={selected}
                                  onChange={() => chooseSavedAddress(address)}
                                />
                                <span
                                  className={cx(
                                    'grid size-4 place-items-center rounded-full border',
                                    selected ? 'border-brand-900 bg-brand-900 text-white' : 'border-line bg-white',
                                  )}
                                  aria-hidden
                                >
                                  {selected && <Check className="size-2.5" />}
                                </span>
                                {address.label}
                                {address.isDefault && (
                                  <span className="rounded-full bg-sand px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-warm">
                                    Default
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="mt-2 block text-[12px] leading-relaxed text-slate-warm">
                              {address.fullName}
                              <br />
                              {[address.line1, address.line2].filter(Boolean).join(', ')}
                              <br />
                              {address.city}, {address.region}
                              <br />
                              {address.phone}
                            </span>
                          </label>
                        );
                      })}
                      <label
                        className={cx(
                          'flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-[12.5px] font-semibold transition',
                          selectedAddressId === NEW_ADDRESS
                            ? 'border-brand-900 bg-brand-50/50 text-brand-900 ring-1 ring-brand-900/10'
                            : 'border-dashed border-line text-slate-warm hover:border-brand-900/30',
                        )}
                      >
                        <input
                          type="radio"
                          name="saved-address"
                          className="sr-only"
                          checked={selectedAddressId === NEW_ADDRESS}
                          onChange={chooseNewAddress}
                        />
                        <span className="grid size-8 place-items-center rounded-lg bg-sand text-brand-900">
                          <MapPin className="size-4" />
                        </span>
                        Deliver to a different address
                      </label>
                    </div>
                  )}

                  {(selectedAddressId === NEW_ADDRESS || (data?.addresses.length ?? 0) === 0) && (
                    <div className="grid gap-4 rounded-xl border border-line bg-cream/50 p-4 sm:grid-cols-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-warm sm:col-span-2">
                        New delivery address
                      </p>
                      <Field label="Recipient name" error={errors.shippingAddress?.fullName?.message}>
                        {({ id, describedBy }) => (
                          <Input
                            id={id}
                            autoComplete="name"
                            aria-describedby={describedBy}
                            invalid={Boolean(errors.shippingAddress?.fullName)}
                            {...register('shippingAddress.fullName')}
                          />
                        )}
                      </Field>
                      <Field label="Delivery phone" error={errors.shippingAddress?.phone?.message}>
                        {({ id, describedBy }) => (
                          <Input
                            id={id}
                            type="tel"
                            autoComplete="tel"
                            aria-describedby={describedBy}
                            invalid={Boolean(errors.shippingAddress?.phone)}
                            {...register('shippingAddress.phone')}
                          />
                        )}
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Street address" error={errors.shippingAddress?.line1?.message}>
                          {({ id, describedBy }) => (
                            <Input
                              id={id}
                              autoComplete="address-line1"
                              placeholder="Building, street, area"
                              aria-describedby={describedBy}
                              invalid={Boolean(errors.shippingAddress?.line1)}
                              {...register('shippingAddress.line1')}
                            />
                          )}
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Apartment, floor or landmark (optional)">
                          {({ id }) => (
                            <Input
                              id={id}
                              autoComplete="address-line2"
                              placeholder="e.g. 5th floor, opposite Zemen Bank"
                              {...register('shippingAddress.line2')}
                            />
                          )}
                        </Field>
                      </div>
                      <Field label="City" error={errors.shippingAddress?.city?.message}>
                        {({ id, describedBy }) => (
                          <Input
                            id={id}
                            autoComplete="address-level2"
                            aria-describedby={describedBy}
                            invalid={Boolean(errors.shippingAddress?.city)}
                            {...register('shippingAddress.city')}
                          />
                        )}
                      </Field>
                      <Field label="Region" error={errors.shippingAddress?.region?.message}>
                        {({ id, describedBy }) => (
                          <Select
                            id={id}
                            autoComplete="address-level1"
                            aria-describedby={describedBy}
                            invalid={Boolean(errors.shippingAddress?.region)}
                            {...register('shippingAddress.region')}
                          >
                            <option value="">Select a region</option>
                            {REGIONS.map((region) => (
                              <option key={region} value={region}>
                                {region}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Postal code (optional)">
                          {({ id }) => (
                            <Input id={id} autoComplete="postal-code" maxLength={20} {...register('shippingAddress.postalCode')} />
                          )}
                        </Field>
                      </div>
                      <label className="flex cursor-pointer items-start gap-2.5 sm:col-span-2">
                        <input type="checkbox" className="mt-0.5 size-4 accent-brand-900" {...register('saveAddress')} />
                        <span className="text-[12px] leading-relaxed text-slate-warm">
                          Save this address to my account for faster checkout next time.
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => goToStep(0)} iconLeft={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
                <Button onClick={() => void continueFromAddress()} iconRight={<ArrowRight className="size-4" />}>
                  Continue to delivery
                </Button>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="p-5 sm:p-7" aria-labelledby="step-delivery">
              <StepHeading
                index={3}
                title="Delivery method"
                description="Fees are confirmed again by our server when the order is placed."
              />
              <div className="mt-5 space-y-2.5">
                {data?.deliveryMethods.map((method) => {
                  const selected = deliveryMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      className={cx(
                        'flex cursor-pointer items-start gap-3.5 rounded-xl border p-4 transition',
                        selected
                          ? 'border-brand-900 bg-brand-50/50 ring-1 ring-brand-900/10'
                          : 'border-line hover:border-brand-900/30',
                      )}
                    >
                      <input
                        type="radio"
                        value={method.id}
                        className="sr-only"
                        checked={selected}
                        onChange={() => {
                          setValue('deliveryMethod', method.id, { shouldValidate: true });
                        }}
                      />
                      <span
                        className={cx(
                          'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
                          selected ? 'bg-brand-900 text-white' : 'bg-sand text-brand-900',
                        )}
                      >
                        {method.id === 'pickup' ? <Store className="size-4" /> : <Truck className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13.5px] font-bold text-brand-900">{method.label}</span>
                          <span className="text-[12.5px] font-semibold text-brand-900">
                            {method.effectiveFee === 0 ? (
                              <span className="text-emerald-700">Free</span>
                            ) : (
                              formatSantim(method.effectiveFee)
                            )}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-warm">
                          {method.description}
                        </span>
                        {method.fee > 0 && method.effectiveFee === 0 && (
                          <span className="mt-1 block text-[10.5px] font-medium text-emerald-700">
                            Free because your order is over {formatSantim(data.freeShippingThreshold)}.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.deliveryMethod && (
                <p className="mt-2 text-xs font-medium text-red-600">{errors.deliveryMethod.message}</p>
              )}
              <div className="mt-6 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => goToStep(1)} iconLeft={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
                <Button onClick={() => goToStep(3)} iconRight={<ArrowRight className="size-4" />}>
                  Continue to payment
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="p-5 sm:p-7" aria-labelledby="step-payment">
              <StepHeading
                index={4}
                title="Payment"
                description="Choose how you would like to pay. We never store card numbers or mobile money PINs."
              />
              <div className="mt-5 space-y-2.5">
                {data?.paymentOptions.map((option) => {
                  const selectable = option.available && option.implemented;
                  const selected = paymentMethod === option.id;
                  return (
                    <label
                      key={option.id}
                      className={cx(
                        'flex items-start gap-3.5 rounded-xl border p-4 transition',
                        selectable ? 'cursor-pointer' : 'cursor-not-allowed bg-cream/60 opacity-80',
                        selected && selectable
                          ? 'border-brand-900 bg-brand-50/50 ring-1 ring-brand-900/10'
                          : 'border-line',
                        selectable && !selected && 'hover:border-brand-900/30',
                      )}
                    >
                      <input
                        type="radio"
                        name="payment-method"
                        value={option.id}
                        disabled={!selectable}
                        className="sr-only"
                        checked={selected && selectable}
                        onChange={() => setValue('paymentMethod', option.id as 'cod' | 'chapa', { shouldValidate: true })}
                      />
                      <span
                        className={cx(
                          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg',
                          selected && selectable ? 'bg-brand-900 text-white' : 'bg-sand text-brand-900',
                        )}
                      >
                        {option.id === 'cod' ? <Banknote className="size-4" /> : <CreditCard className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[13.5px] font-bold text-brand-900">{option.label}</span>
                          {!selectable && (
                            <span className="rounded-full bg-sand px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-slate-warm">
                              {option.requiresSetup ? 'Not activated' : 'Unavailable'}
                            </span>
                          )}
                          {option.id === 'cod' && selectable && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
                              Available
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-warm">
                          {paymentNote(option.id, option.note)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-2.5 rounded-xl bg-cream px-4 py-3 text-[11.5px] leading-relaxed text-slate-warm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                Payments are processed on the provider’s secure page. Your order is marked paid only after the
                provider confirms the transaction — never just because you returned to our site.
              </div>

              <div className="mt-5">
                <Field
                  label="Order note (optional)"
                  hint="Delivery instructions, preferred time or a gift message."
                  error={errors.customerNote?.message}
                >
                  {({ id, describedBy }) => (
                    <Textarea
                      id={id}
                      rows={3}
                      maxLength={500}
                      aria-describedby={describedBy}
                      placeholder="Anything our courier should know?"
                      invalid={Boolean(errors.customerNote)}
                      {...register('customerNote')}
                    />
                  )}
                </Field>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => goToStep(2)} iconLeft={<ArrowLeft className="size-4" />}>
                  Back
                </Button>
                <Button onClick={() => goToStep(4)} iconRight={<ArrowRight className="size-4" />}>
                  Review order
                </Button>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="p-5 sm:p-7" aria-labelledby="step-review">
              <StepHeading
                index={5}
                title="Review and place order"
                description="Check the details below. Prices and stock are verified again on our server."
              />

              <div className="mt-5 space-y-4">
                <div className="overflow-hidden rounded-xl border border-line">
                  {cart.items.map((item) => (
                    <div
                      key={item.cartItemId}
                      className="flex items-center gap-3 border-b border-line/70 p-3 last:border-0"
                    >
                      <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-sand">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/product/${item.slug}`}
                          className="line-clamp-1 text-[12.5px] font-semibold text-brand-900 hover:text-brand-600"
                        >
                          {item.name}
                        </Link>
                        <p className="text-[11px] text-slate-warm">
                          {item.variantLabel} · Qty {item.quantity}
                        </p>
                      </div>
                      <p className="text-[12.5px] font-semibold text-brand-900">{formatSantim(item.lineTotal)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <ReviewCard
                    icon={<MapPin className="size-4" />}
                    title="Contact & delivery"
                    onEdit={() => goToStep(0)}
                  >
                    <p className="font-semibold text-brand-900">{contact.fullName}</p>
                    <p>{contact.email}</p>
                    <p>{contact.phone}</p>
                    {!isPickup && (
                      <p className="mt-1.5">
                        {[shipping.line1, shipping.line2].filter(Boolean).join(', ')}
                        <br />
                        {shipping.city}, {shipping.region}
                        <br />
                        {shipping.fullName} · {shipping.phone}
                      </p>
                    )}
                    {isPickup && <p className="mt-1.5 font-medium text-brand-900">Store pickup</p>}
                  </ReviewCard>
                  <ReviewCard
                    icon={<Truck className="size-4" />}
                    title="Delivery & payment"
                    onEdit={() => goToStep(2)}
                  >
                    <p className="font-semibold text-brand-900">{delivery?.label}</p>
                    <p>{delivery?.description}</p>
                    <p className="mt-1.5">
                      {payment?.label} ·{' '}
                      {shippingFee === 0 ? 'Free delivery' : `${formatSantim(shippingFee)} delivery`}
                    </p>
                  </ReviewCard>
                </div>

                {customerNote && (
                  <div className="rounded-xl border border-line bg-cream/60 p-4">
                    <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-warm">
                      Order note
                    </p>
                    <p className="mt-1 text-[12.5px] leading-relaxed text-slate-warm">{customerNote}</p>
                  </div>
                )}

                {cart.coupon && (
                  <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2 text-[12px] text-emerald-800">
                      <Tag className="size-4" />
                      <span>
                        <strong>{cart.coupon.code}</strong> applied · {cart.coupon.description}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await removeCoupon.mutateAsync();
                        } catch (caught) {
                          setCouponNotice(errorMessage(caught));
                        }
                      }}
                      className="text-[11px] font-semibold text-emerald-800 underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </div>
                )}
                {couponNotice && <p className="text-[11px] text-red-600">{couponNotice}</p>}

                <div className="rounded-xl border border-line bg-cream/50 p-4">
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-slate-warm">Subtotal</span>
                      <span className="font-semibold text-brand-900">{formatSantim(totals.subtotal)}</span>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discount</span>
                        <span className="font-semibold">−{formatSantim(totals.discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-warm">Delivery</span>
                      <span className="font-semibold text-brand-900">
                        {totals.shippingFee === 0 ? 'Free' : formatSantim(totals.shippingFee)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between border-t border-line pt-2.5">
                      <span className="font-semibold text-brand-900">Total</span>
                      <span className="font-display text-xl font-extrabold text-brand-900">
                        {formatSantim(totals.total)}
                      </span>
                    </div>
                    <p className="text-right text-[10.5px] text-slate-warm">VAT included · Prices in ETB</p>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-4">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand-900" {...register('acceptTerms')} />
                  <span className="text-[12px] leading-relaxed text-slate-warm">
                    I agree to the{' '}
                    <Link to="/terms" target="_blank" className="font-semibold text-brand-900 underline underline-offset-2">
                      terms of service
                    </Link>{' '}
                    and{' '}
                    <Link to="/returns" target="_blank" className="font-semibold text-brand-900 underline underline-offset-2">
                      returns policy
                    </Link>
                    , and I confirm my delivery details are correct.
                  </span>
                </label>
                {errors.acceptTerms && (
                  <p className="text-xs font-medium text-red-600">{errors.acceptTerms.message}</p>
                )}

                {paymentMethod === 'chapa' && (
                  <div className="flex gap-2.5 rounded-xl bg-brand-50 px-4 py-3 text-[11.5px] leading-relaxed text-brand-900">
                    <Lock className="mt-0.5 size-4 shrink-0" />
                    You will be redirected to Chapa to complete payment. Keep this page open until you are
                    returned here. We only confirm the order after Chapa verifies the transaction.
                  </div>
                )}

                {serverError && (
                  <div role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-medium text-red-700">
                    {serverError}
                  </div>
                )}

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" onClick={() => goToStep(3)} iconLeft={<ArrowLeft className="size-4" />}>
                    Back to payment
                  </Button>
                  <Button
                    size="lg"
                    loading={placeOrder.isPending}
                    disabled={!acceptTerms}
                    onClick={() => void submitOrder()}
                    iconLeft={<PackageCheck className="size-4" />}
                  >
                    {paymentMethod === 'cod' ? 'Place order' : 'Continue to payment'}
                  </Button>
                </div>
                <p className="text-center text-[10.5px] text-slate-warm sm:text-right">
                  {paymentMethod === 'cod'
                    ? `You will pay ${formatSantim(totals.total)} in cash on delivery.`
                    : `You will pay ${formatSantim(totals.total)} on the secure payment page.`}
                </p>
              </div>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-[128px]">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
            <h2 className="font-display text-lg font-bold text-brand-900">Order summary</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-warm">
              {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
            </p>
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
              {cart.items.map((item) => (
                <div key={item.cartItemId} className="flex items-center gap-3">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                    )}
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-brand-900 text-[9px] font-bold text-white">
                      {item.quantity}
                    </span>
                  </div>
                  <p className="line-clamp-2 min-w-0 flex-1 text-[11.5px] font-medium leading-snug text-brand-900">
                    {item.name}
                  </p>
                  <p className="text-[11.5px] font-semibold text-brand-900">{formatSantim(item.lineTotal)}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-slate-warm">Subtotal</span>
                <span className="font-semibold text-brand-900">{formatSantim(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-semibold">−{formatSantim(totals.discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-warm">Delivery</span>
                <span className="font-semibold text-brand-900">
                  {delivery ? (totals.shippingFee === 0 ? 'Free' : formatSantim(totals.shippingFee)) : 'Select method'}
                </span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2.5">
                <span className="font-semibold text-brand-900">Total</span>
                <span className="font-display text-xl font-extrabold text-brand-900">{formatSantim(totals.total)}</span>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[11px] text-slate-warm">
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-3.5 text-emerald-600" /> Totals calculated on our server.
              </p>
              <p className="flex items-center gap-2">
                <Truck className="size-3.5 text-gold-600" /> Free standard delivery over{' '}
                {formatSantim(data?.freeShippingThreshold ?? 300000)}.
              </p>
              <p className="flex items-center gap-2">
                <Lock className="size-3.5 text-brand-700" /> Card and mobile money details never touch our servers.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepHeading({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-900 font-display text-sm font-bold text-white">
        {index}
      </span>
      <div>
        <h2 className="font-display text-xl font-bold text-brand-900">{title}</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-warm">{description}</p>
      </div>
    </div>
  );
}

function ReviewCard({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-warm">
          <span className="text-brand-900">{icon}</span> {title}
        </p>
        <button
          type="button"
          onClick={onEdit}
          className="text-[11px] font-semibold text-brand-900 underline decoration-gold-400 underline-offset-2"
        >
          Edit
        </button>
      </div>
      <div className="mt-2 space-y-0.5 text-[12px] leading-relaxed text-slate-warm">{children}</div>
    </div>
  );
}
