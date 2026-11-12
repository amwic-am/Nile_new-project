import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  KeyRound,
  LogOut,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { Button, ButtonLink, EmptyState, Field, Input, Modal, Skeleton } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useRevokeSession, useSessions } from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';
import type { SessionInfo } from '@/lib/types';

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/\d/, 'Include at least one number'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((values) => values.currentPassword !== values.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used before',
  });

type PasswordValues = z.infer<typeof passwordSchema>;

function deviceLabel(userAgent: string): string {
  if (!userAgent) return 'Unknown browser';
  const browser = /Edg\//.test(userAgent)
    ? 'Microsoft Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Firefox\//.test(userAgent)
          ? 'Firefox'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown device';
  return `${browser} on ${os}`;
}

function isMobileAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/.test(userAgent);
}

export default function AccountSecurityPage() {
  const user = useAuth((state) => state.user);
  const setUser = useAuth((state) => state.setUser);
  const push = useToasts((state) => state.push);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useSessions(true);
  const revokeSession = useRevokeSession();
  const [serverError, setServerError] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [resending, setResending] = useState(false);
  const [devVerifyUrl, setDevVerifyUrl] = useState<string | null>(null);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  useSeo({
    title: 'Security',
    description: 'Manage your Nile Mart password, email verification and active sessions.',
    canonicalPath: '/account/security',
    noIndex: true,
  });

  const submitPassword = handleSubmit(async (values) => {
    setServerError('');
    setPasswordSaved(false);
    try {
      const result = await api.post<{ message: string }>('/auth/change-password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      reset();
      setPasswordSaved(true);
      push(result.message);
      queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    } catch (caught) {
      setServerError(errorMessage(caught));
    }
  });

  const resendVerification = async () => {
    setResending(true);
    try {
      const result = await api.post<{ sent: boolean; devVerifyUrl?: string }>('/auth/resend-verification', {});
      setDevVerifyUrl(result.devVerifyUrl ?? null);
      push('Verification email sent. Check your inbox.');
    } catch (caught) {
      push(errorMessage(caught), 'error');
    } finally {
      setResending(false);
    }
  };

  const revoke = (session: SessionInfo) => {
    revokeSession.mutate(session.id, {
      onSuccess: () => push('That device has been signed out.', 'info'),
      onError: (caught) => push(errorMessage(caught), 'error'),
    });
  };

  const signOutAll = async () => {
    setLoggingOut(true);
    try {
      await api.post('/auth/logout-all');
      setUser(null);
      queryClient.removeQueries({ queryKey: ['account'] });
      navigate('/login', { replace: true });
    } catch (caught) {
      push(errorMessage(caught), 'error');
      setLoggingOut(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <h2 className="font-display text-lg font-bold text-brand-900">Security</h2>
        <p className="mt-0.5 text-[12px] text-slate-warm">
          Manage your sign-in email, password and the devices signed in to your account.
        </p>
      </div>

      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-10 shrink-0 place-items-center rounded-xl ${
                user.emailVerified ? 'bg-emerald-50 text-emerald-600' : 'bg-gold-50 text-gold-700'
              }`}
            >
              {user.emailVerified ? <BadgeCheck className="size-5" /> : <ShieldAlert className="size-5" />}
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-brand-900">Sign-in email</h2>
              <p className="mt-0.5 text-[12px] text-slate-warm">{user.email}</p>
              <p className="mt-1 text-[11.5px] text-slate-warm">
                {user.emailVerified
                  ? 'Your email is verified. Receipts and delivery updates are sent here.'
                  : 'Verify your email to secure your account and receive receipts.'}
              </p>
              {devVerifyUrl && (
                <ButtonLink to={new URL(devVerifyUrl).pathname + new URL(devVerifyUrl).search} size="sm" className="mt-2">
                  Verify now (development)
                </ButtonLink>
              )}
            </div>
          </div>
          {!user.emailVerified && (
            <Button size="sm" variant="outline" loading={resending} onClick={() => void resendVerification()}>
              Resend verification
            </Button>
          )}
        </div>
      </section>

      <section className="surface p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-gold-600" />
          <h2 className="font-display text-lg font-bold text-brand-900">Change password</h2>
        </div>
        <p className="mt-1 text-[12px] text-slate-warm">
          Use at least 8 characters with a letter and a number. Changing your password signs out other devices.
        </p>

        <form onSubmit={submitPassword} className="mt-4 space-y-4" noValidate>
          {serverError && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">
              {serverError}
            </div>
          )}
          {passwordSaved && (
            <div className="rounded-xl bg-emerald-50 px-3.5 py-3 text-[12.5px] font-medium text-emerald-800">
              Password updated. Other devices have been signed out.
            </div>
          )}
          <Field label="Current password" error={errors.currentPassword?.message}>
            {({ id }) => (
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                invalid={Boolean(errors.currentPassword)}
                {...register('currentPassword')}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" error={errors.newPassword?.message}>
              {({ id }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="new-password"
                  invalid={Boolean(errors.newPassword)}
                  {...register('newPassword')}
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
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={isSubmitting}>
              Update password
            </Button>
          </div>
        </form>
      </section>

      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900">
              <ShieldCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-brand-900">Active sessions</h2>
              <p className="mt-0.5 text-[12px] text-slate-warm">
                Devices currently signed in to your account.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 hover:border-red-200 hover:bg-red-50"
            iconLeft={<LogOut className="size-3.5" />}
            onClick={() => setLogoutAllOpen(true)}
          >
            Sign out all devices
          </Button>
        </div>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((item) => (
                <Skeleton key={item} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : isError || !data ? (
            <EmptyState
              icon={<Monitor className="size-6" />}
              title="Sessions could not be loaded"
              description={errorMessage(error)}
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              {data.sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line/70 p-3.5 last:border-0"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-cream text-brand-900">
                    {isMobileAgent(session.userAgent) ? (
                      <Smartphone className="size-4" />
                    ) : (
                      <Monitor className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-brand-900">
                      {deviceLabel(session.userAgent)}
                      {session.current && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-emerald-700">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-warm">
                      Last active {formatDateTime(session.lastSeenAt)}
                      {session.ip ? ` · ${session.ip}` : ''}
                    </p>
                  </div>
                  {!session.current && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => revoke(session)}
                    >
                      Sign out
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-brand-900">
            <ShieldCheck className="size-5" />
          </span>
          <div className="text-[11.5px] leading-relaxed text-slate-warm">
            <p className="font-display text-sm font-bold text-brand-900">How we protect your account</p>
            <p className="mt-1">
              Passwords are stored as salted scrypt hashes. Sessions use opaque, HTTP-only cookies.
              Nile Mart never stores raw card numbers, CVVs or payment credentials — online payments are completed on
              the provider's secure checkout.
            </p>
          </div>
        </div>
      </section>

      <Modal open={logoutAllOpen} onClose={() => setLogoutAllOpen(false)} title="Sign out of all devices?" size="sm">
        <p className="text-[12.5px] leading-relaxed text-slate-warm">
          Every session, including this one, will end immediately. You can sign back in with your email and password.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setLogoutAllOpen(false)}>
            Stay signed in
          </Button>
          <Button variant="danger" loading={loggingOut} onClick={() => void signOutAll()}>
            Sign out all devices
          </Button>
        </div>
      </Modal>
    </div>
  );
}
