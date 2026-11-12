import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { safeNext } from '@/components/auth/RequireAuth';
import { Button, ButtonLink, Field, Input } from '@/components/ui';
import { errorMessage, fieldErrors } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';

const schema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(100),
    email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[+0-9 ()-]*$/, 'Use digits, spaces, + or -')
      .optional(),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    acceptTerms: z.boolean().refine((value) => value === true, 'Accept the terms to continue'),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const registerUser = useAuth((state) => state.register);
  const navigate = useNavigate();
  const push = useToasts((state) => state.push);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
      marketingOptIn: true,
    },
  });

  useSeo({
    title: 'Create an account',
    description: 'Create a Nile Mart account to shop, track orders and save favourites.',
    canonicalPath: '/register',
    noIndex: true,
  });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const result = await registerUser({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        marketingOptIn: values.marketingOptIn,
      });
      setCreated(true);
      if (result.user) {
        push(`Welcome to Nile Mart, ${result.user.fullName.split(' ')[0]}.`);
      } else {
        setPendingEmail(result.email ?? values.email);
      }
      if (result.devVerifyUrl) setDevVerifyUrl(result.devVerifyUrl);
    } catch (caught) {
      const fields = fieldErrors(caught);
      if (Object.keys(fields).length) {
        for (const [field, message] of Object.entries(fields)) {
          setError(field as keyof FormValues, { message });
        }
      } else {
        setServerError(errorMessage(caught));
      }
    }
  });

  if (created) {
    return (
      <AuthLayout
        title={pendingEmail ? 'Check your inbox' : 'Your account is ready'}
        subtitle={
          pendingEmail
            ? `We sent a confirmation link to ${pendingEmail}. Open it to finish creating your account.`
            : 'You are signed in. Verify your email to unlock checkout and order notifications.'
        }
        footer={
          <Link to="/products" className="font-semibold text-brand-900 underline decoration-gold-400 underline-offset-4">
            Continue shopping
          </Link>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p className="text-[12.5px] leading-relaxed text-emerald-800">
              {pendingEmail
                ? 'Your details are saved. Click the link in the email to confirm your address, then sign in.'
                : 'Account created. We emailed you a verification link. Check your inbox, or resend it from your account security page.'}
            </p>
          </div>
          {devVerifyUrl && (
            <div className="rounded-xl border border-dashed border-gold-300 bg-gold-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">Development only</p>
              <p className="mt-1 text-[12px] text-gold-900">SMTP is not configured, so use this direct link:</p>
              <ButtonLink to={new URL(devVerifyUrl).pathname + new URL(devVerifyUrl).search} size="sm" className="mt-2">
                Verify email now
              </ButtonLink>
            </div>
          )}
          {pendingEmail ? (
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`, { replace: true })}
            >
              Go to sign in
            </Button>
          ) : (
            <Button
              fullWidth
              size="lg"
              onClick={() => navigate(next === '/account' ? '/account' : next, { replace: true })}
            >
              Go to my account
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Save time at checkout, follow deliveries and keep everything you love in one place."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {serverError && (
          <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">{serverError}</div>
        )}

        <Field label="Full name" error={errors.fullName?.message}>
          {({ id }) => (
            <Input
              id={id}
              autoComplete="name"
              placeholder="e.g. Hana Tesfaye"
              invalid={Boolean(errors.fullName)}
              {...register('fullName')}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email address" error={errors.email?.message}>
            {({ id }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                invalid={Boolean(errors.email)}
                {...register('email')}
              />
            )}
          </Field>
          <Field label="Phone (optional)" error={errors.phone?.message}>
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

        <Field
          label="Password"
          error={errors.password?.message}
          hint="At least 8 characters with a letter and a number."
        >
          {({ id, describedBy }) => (
            <div className="relative">
              <Input
                id={id}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a strong password"
                className="pr-11"
                aria-describedby={describedBy}
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-warm hover:bg-sand"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>

        <Field label="Confirm password" error={errors.confirmPassword?.message}>
          {({ id }) => (
            <Input
              id={id}
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat your password"
              invalid={Boolean(errors.confirmPassword)}
              {...register('confirmPassword')}
            />
          )}
        </Field>

        <div className="space-y-2.5 rounded-xl bg-cream/70 p-3.5">
          <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-warm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-line accent-brand-900"
              {...register('acceptTerms')}
            />
            <span>
              I agree to the{' '}
              <Link to="/terms" className="font-medium text-brand-900 underline underline-offset-2">
                terms of service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-brand-900 underline underline-offset-2">
                privacy policy
              </Link>
              .
            </span>
          </label>
          {errors.acceptTerms && <p className="text-[11px] font-medium text-red-600">{errors.acceptTerms.message}</p>}
          <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-slate-warm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-line accent-brand-900"
              {...register('marketingOptIn')}
            />
            Send me offers, new arrivals and seasonal edits.
          </label>
        </div>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
