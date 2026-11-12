import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, MailCheck, Send } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, ButtonLink, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import type { AuthUser } from '@/lib/types';
import { useAuth } from '@/stores/auth';

type State =
  | { kind: 'verifying' }
  | { kind: 'verified' }
  | { kind: 'failed'; message: string }
  | { kind: 'missing' };

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const tokenHash = params.get('token_hash') ?? '';
  const tokenKey = tokenHash || token;
  const verifyType = params.get('type') === 'email' ? 'email' : 'signup';
  const [state, setState] = useState<State>(tokenKey ? { kind: 'verifying' } : { kind: 'missing' });
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [resendDevUrl, setResendDevUrl] = useState<string | null>(null);
  const [resendError, setResendError] = useState('');
  const attempted = useRef<string | null>(null);

  const user = useAuth((store) => store.user);
  const setUser = useAuth((store) => store.setUser);

  useSeo({
    title: 'Verify your email',
    description: 'Confirm your email address to secure your Nile Mart account.',
    canonicalPath: '/verify-email',
    noIndex: true,
  });

  useEffect(() => {
    if (!tokenKey || attempted.current === tokenKey) return;
    attempted.current = tokenKey;

    void api
      .post<{ verified: boolean; user: AuthUser | null }>('/auth/verify-email', {
        ...(token ? { token } : {}),
        ...(tokenHash ? { tokenHash, type: verifyType } : {}),
      })
      .then((result) => {
        setState({ kind: 'verified' });
        if (result.user) setUser(result.user);
        else if (user) setUser({ ...user, emailVerified: true });
      })
      .catch((error) => {
        setState({ kind: 'failed', message: errorMessage(error) });
      });
  }, [token, tokenHash, tokenKey, verifyType, user, setUser]);

  const resend = async () => {
    setResending(true);
    setResendError('');
    setResendMessage('');
    setResendDevUrl(null);
    try {
      const result = await api.post<{ sent: boolean; verified?: boolean; devVerifyUrl?: string }>(
        '/auth/resend-verification',
        { email: user ? undefined : email.trim() || undefined },
      );
      if (result.verified) {
        setState({ kind: 'verified' });
        if (user) setUser({ ...user, emailVerified: true });
        return;
      }
      setResendMessage(
        'If that email belongs to an unverified account, a fresh verification link is on its way.',
      );
      setResendDevUrl(result.devVerifyUrl ?? null);
    } catch (error) {
      setResendError(errorMessage(error));
    } finally {
      setResending(false);
    }
  };

  const title = {
    verifying: 'Verifying your email',
    verified: 'Email verified',
    failed: 'This link has expired',
    missing: 'Check your inbox',
  }[state.kind];

  const subtitle = {
    verifying: 'One moment while we confirm your email address.',
    verified: 'Your email address is confirmed. Your account is now fully secure.',
    failed: 'Verification links expire after 24 hours. Request a new one below.',
    missing: 'We sent a verification link to your inbox. Open it to confirm your email address.',
  }[state.kind];

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      footer={
        <Link to="/login" className="font-semibold text-brand-900">
          Back to sign in
        </Link>
      }
    >
      {state.kind === 'verifying' && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-5 text-sm text-slate-warm">
          <Loader2 className="size-5 animate-spin text-brand-900" />
          Confirming your verification token…
        </div>
      )}

      {state.kind === 'verified' && (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3.5">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[13px] font-semibold text-emerald-800">You are all set</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-emerald-700">
                Order updates, receipts and security alerts will now reach your inbox.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink to="/products" fullWidth>
              Start shopping
            </ButtonLink>
            <ButtonLink to="/account" fullWidth variant="outline">
              Go to my account
            </ButtonLink>
          </div>
        </div>
      )}

      {(state.kind === 'failed' || state.kind === 'missing') && (
        <div className="space-y-5">
          {state.kind === 'failed' && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3.5">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
              <p className="text-[12.5px] leading-relaxed text-red-700">{state.message}</p>
            </div>
          )}

          {state.kind === 'missing' && (
            <div className="flex items-start gap-3 rounded-xl border border-line bg-cream px-4 py-3.5">
              <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-900" />
              <p className="text-[12.5px] leading-relaxed text-slate-warm">
                Click the link in the email we sent when you registered. It is valid for 24 hours and can only be
                used once.
              </p>
            </div>
          )}

          {user ? (
            <Button fullWidth size="lg" loading={resending} onClick={() => void resend()}>
              <Send className="size-4" /> Resend to {user.email}
            </Button>
          ) : (
            <div className="space-y-3">
              <Field label="Email address" hint="Use the email you registered with.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="email"
                    aria-describedby={describedBy}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && email.trim()) void resend();
                    }}
                  />
                )}
              </Field>
              <Button
                fullWidth
                size="lg"
                loading={resending}
                disabled={!email.trim()}
                onClick={() => void resend()}
              >
                <Send className="size-4" /> Send a new link
              </Button>
            </div>
          )}

          {resendError && (
            <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">
              {resendError}
            </div>
          )}

          {resendMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-emerald-800">
              {resendMessage}
            </div>
          )}

          {resendDevUrl && (
            <div className="rounded-xl border border-dashed border-gold-300 bg-gold-50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-800">Development only</p>
              <p className="mt-1 text-[12px] text-gold-900">SMTP is not configured. Use this direct link:</p>
              <ButtonLink
                to={new URL(resendDevUrl).pathname + new URL(resendDevUrl).search}
                size="sm"
                className="mt-2"
              >
                Verify email now
              </ButtonLink>
            </div>
          )}

          <p className="text-center text-[11.5px] text-slate-warm">
            Wrong address?{' '}
            <Link to="/register" className="font-semibold text-brand-900 underline underline-offset-2">
              Create a new account
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
