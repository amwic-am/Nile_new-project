import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Bell, Mail, ShieldAlert, Sparkles } from 'lucide-react';
import { Button, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUpdateProfile } from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(100),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((value) => value === '' || /^[+0-9 ()-]{7,30}$/.test(value), 'Enter a valid phone number'),
  marketingOptIn: z.boolean(),
  orderUpdates: z.boolean(),
  promotions: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function AccountProfilePage() {
  const user = useAuth((state) => state.user);
  const setUser = useAuth((state) => state.setUser);
  const push = useToasts((state) => state.push);
  const updateProfile = useUpdateProfile();
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: user?.fullName ?? '',
      phone: user?.phone ?? '',
      marketingOptIn: user?.marketingOptIn ?? false,
      orderUpdates: user?.notificationPrefs?.order_updates ?? true,
      promotions: user?.notificationPrefs?.promotions ?? false,
    },
  });

  useSeo({
    title: 'Profile settings',
    description: 'Update your Nile Mart profile and notification preferences.',
    canonicalPath: '/account/profile',
    noIndex: true,
  });

  useEffect(() => {
    if (!user) return;
    reset({
      fullName: user.fullName,
      phone: user.phone ?? '',
      marketingOptIn: user.marketingOptIn,
      orderUpdates: user.notificationPrefs?.order_updates ?? true,
      promotions: user.notificationPrefs?.promotions ?? false,
    });
  }, [user, reset]);

  const marketingOptIn = watch('marketingOptIn');

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const result = await updateProfile.mutateAsync({
        fullName: values.fullName,
        phone: values.phone || null,
        marketingOptIn: values.marketingOptIn,
        notificationPrefs: {
          order_updates: values.orderUpdates,
          promotions: values.promotions,
        },
      });
      setUser(result.user);
      push(result.message);
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      <section className="surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-900">Personal details</h2>
            <p className="mt-0.5 text-[12px] text-slate-warm">
              Used on receipts, delivery notes and order updates.
            </p>
          </div>
          <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-medium text-slate-warm">
            Member since {formatDate(user.createdAt)}
          </span>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-5" noValidate>
          {serverError && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">
              {serverError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" error={errors.fullName?.message}>
              {({ id }) => (
                <Input
                  id={id}
                  autoComplete="name"
                  invalid={Boolean(errors.fullName)}
                  {...register('fullName')}
                />
              )}
            </Field>
            <Field
              label="Phone number"
              error={errors.phone?.message}
              hint="Used by the courier to reach you on delivery."
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="tel"
                  autoComplete="tel"
                  placeholder="+251 911 234 567"
                  invalid={Boolean(errors.phone)}
                  {...register('phone')}
                />
              )}
            </Field>
          </div>

          <Field label="Email address" hint="Contact customer care if you need to change your sign-in email.">
            {({ id }) => (
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
                <Input id={id} value={user.email} readOnly className="bg-cream/60 pl-10 pr-36" />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  {user.emailVerified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      <BadgeCheck className="size-3" /> Verified
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gold-800">
                      <ShieldAlert className="size-3" /> Unverified
                    </span>
                  )}
                </span>
              </div>
            )}
          </Field>

          <div className="border-t border-line/70 pt-5">
            <h3 className="flex items-center gap-2 font-display text-base font-bold text-brand-900">
              <Bell className="size-4 text-gold-600" /> Notifications
            </h3>
            <p className="mt-0.5 text-[12px] text-slate-warm">
              Choose which updates you want to receive. Order confirmations are always sent.
            </p>

            <div className="mt-4 space-y-2.5">
              <PreferenceRow
                title="Order and delivery updates"
                description="Payment confirmations, dispatch notices and delivery status."
                checked={watch('orderUpdates')}
                input={<input type="checkbox" className="peer sr-only" {...register('orderUpdates')} />}
              />
              <PreferenceRow
                title="Offers and product news"
                description="Occasional promotions, price drops and new arrivals."
                checked={watch('promotions')}
                input={<input type="checkbox" className="peer sr-only" {...register('promotions')} />}
              />
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-cream/50 p-3.5">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-line accent-brand-900"
                {...register('marketingOptIn')}
              />
              <span>
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-900">
                  <Sparkles className="size-3.5 text-gold-600" /> Join the Nile Mart newsletter
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-warm">
                  {marketingOptIn
                    ? 'You will receive curated offers and early access to seasonal sales.'
                    : 'Subscribe for curated offers and early access to seasonal sales.'}
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line/70 pt-4">
            {isDirty && <span className="mr-auto text-[11.5px] text-slate-warm">You have unsaved changes.</span>}
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-slate-warm">
        Your password, active sessions and email verification are managed under{' '}
        <Link to="/account/security" className="font-semibold text-brand-900 underline underline-offset-2">
          Security
        </Link>
        . Nile Mart never stores card numbers or payment credentials.
      </p>
    </div>
  );
}

function PreferenceRow({
  title,
  description,
  checked,
  input,
}: {
  title: string;
  description: string;
  checked: boolean;
  input: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3 transition hover:border-brand-200">
      {input}
      <span>
        <span className="block text-[12.5px] font-semibold text-brand-900">{title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-slate-warm">{description}</span>
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-900/30 peer-focus-visible:ring-offset-2 ${
          checked ? 'bg-brand-900' : 'bg-line'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </label>
  );
}
