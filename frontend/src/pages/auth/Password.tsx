import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, ButtonLink, Field, Input } from '@/components/ui';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useSeo } from '@/lib/seo';

const emailSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
});

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });

  useSeo({
    title: 'Reset your password',
    description: 'Request a password reset link for your Nile Mart account.',
    canonicalPath: '/forgot-password',
    noIndex: true,
  });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const result = await api.post<{ message: string; devResetUrl?: string }>('/auth/forgot-password', {
        email: values.email,
      });
      setSent(true);
      setDevResetUrl(result.devResetUrl ?? null);
    } catch (caught) {
      setServerError(errorMessage(caught));
    }
  });

  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter the email on your account and we will send a secure reset link."
      footer={
        <Link to="/login" className="inline-flex items-center gap-1.5 font-semibold text-brand-900">
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <p className="text-[12.5px] leading-relaxed text-emerald-800">
              If an account exists for that email, a reset link has been sent. The link is valid for one hour.
            </p>
          </div>
          {devResetUrl && (
            <div className="rounded-xl border border-dashed border-gold-300 bg-gold-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">Development only</p>
              <p className="mt-1 text-[12px] text-gold-900">SMTP is not configured. Use this direct link:</p>
              <ButtonLink to={new URL(devResetUrl).pathname + new URL(devResetUrl).search} size="sm" className="mt-2">
                Reset password now
              </ButtonLink>
            </div>
          )}
          <ButtonLink to="/login" fullWidth variant="outline">
            Return to sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">{serverError}</div>
          )}
          <Field label="Email address" error={errors.email?.message}>
            {({ id }) => (
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="pl-10"
                  invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </div>
            )}
          </Field>
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const tokenHash = params.get('token_hash') ?? '';
  const tokenKey = tokenHash || token;
  const navigate = useNavigate();
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ password: string; confirmPassword: string }>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  useSeo({
    title: 'Choose a new password',
    description: 'Set a new password for your Nile Mart account.',
    canonicalPath: '/reset-password',
    noIndex: true,
  });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    if (!tokenKey) {
      setServerError('This reset link is missing its token. Request a new link.');
      return;
    }
    try {
      await api.post('/auth/reset-password', {
        ...(token ? { token } : {}),
        ...(tokenHash ? { tokenHash } : {}),
        password: values.password,
      });
      setDone(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 2200);
    } catch (caught) {
      const fields = fieldErrors(caught);
      if (fields.password) setError('password', { message: fields.password });
      else setServerError(errorMessage(caught));
    }
  });

  return (
    <AuthLayout
      title={done ? 'Password updated' : 'Choose a new password'}
      subtitle={
        done
          ? 'You can now sign in with your new password. We have signed out other devices.'
          : 'Pick something strong that you have not used elsewhere.'
      }
      footer={
        done ? (
          <Link to="/login" className="font-semibold text-brand-900 underline decoration-gold-400 underline-offset-4">
            Sign in now
          </Link>
        ) : (
          <Link to="/forgot-password" className="font-semibold text-brand-900">
            Request a new link
          </Link>
        )
      }
    >
      {done ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <p className="text-[12.5px] leading-relaxed text-emerald-800">
            Your password has been changed. Redirecting you to sign in…
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {!tokenKey && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">
              This link is missing its reset token.{' '}
              <Link to="/forgot-password" className="underline underline-offset-2">
                Request a new one
              </Link>
              .
            </div>
          )}
          {serverError && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">{serverError}</div>
          )}
          <Field
            label="New password"
            error={errors.password?.message}
            hint="At least 8 characters with a letter and a number."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                aria-describedby={describedBy}
                invalid={Boolean(errors.password)}
                {...register('password')}
              />
            )}
          </Field>
          <Field label="Confirm new password" error={errors.confirmPassword?.message}>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                invalid={Boolean(errors.confirmPassword)}
                {...register('confirmPassword')}
              />
            )}
          </Field>
          <Button type="submit" fullWidth size="lg" loading={isSubmitting} disabled={!tokenKey}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
