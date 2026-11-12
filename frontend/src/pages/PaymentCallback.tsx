import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button, ButtonLink } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSeo } from '@/lib/seo';

type PaymentState =
  | { kind: 'verifying' }
  | { kind: 'pending'; message: string }
  | { kind: 'failed'; message: string; orderId?: string }
  | { kind: 'missing' };

export default function PaymentCallbackPage() {
  const [params] = useSearchParams();
  const reference = params.get('reference') ?? params.get('trx_ref') ?? '';
  const navigate = useNavigate();
  const [state, setState] = useState<PaymentState>(reference ? { kind: 'verifying' } : { kind: 'missing' });
  const attempted = useRef(false);
  const [checking, setChecking] = useState(false);

  useSeo({
    title: 'Confirming your payment',
    description: 'We are verifying your payment with the provider.',
    canonicalPath: '/checkout/payment/callback',
    noIndex: true,
  });

  const verify = async () => {
    setChecking(true);
    try {
      const result = await api.get<{
        status: 'successful' | 'pending' | 'failed' | 'refund_required';
        orderId?: string;
        message?: string;
      }>(`/payments/chapa/verify/${encodeURIComponent(reference)}`);

      if (result.status === 'successful' && result.orderId) {
        navigate(`/checkout/success/${result.orderId}`, {
          replace: true,
          state: { paymentVerified: true },
        });
        return;
      }
      if (result.status === 'pending') {
        setState({
          kind: 'pending',
          message: result.message ?? 'The payment provider has not confirmed your payment yet.',
        });
        return;
      }
      setState({
        kind: 'failed',
        message:
          result.message ??
          (result.status === 'refund_required'
            ? 'Your payment was received but the order could not be confirmed. Our team will contact you about a refund.'
            : 'The payment was not completed. You can try again from your order page.'),
        orderId: result.orderId,
      });
    } catch (caught) {
      setState({ kind: 'failed', message: errorMessage(caught) });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!reference || attempted.current) return;
    attempted.current = true;
    void verify();
  }, [reference]);

  return (
    <AuthLayout
      title={
        state.kind === 'verifying'
          ? 'Confirming your payment'
          : state.kind === 'pending'
            ? 'Payment is still processing'
            : state.kind === 'missing'
              ? 'Payment reference missing'
              : 'Payment not completed'
      }
      subtitle="We check every transaction directly with the payment provider. Returning to this page alone never marks an order as paid."
      footer={
        <Link to="/contact" className="font-semibold text-brand-900">
          Need help? Contact support
        </Link>
      }
    >
      {state.kind === 'verifying' && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-cream px-4 py-5 text-sm text-slate-warm">
          <Loader2 className="size-5 animate-spin text-brand-900" />
          Asking Chapa to confirm the transaction…
        </div>
      )}

      {state.kind === 'pending' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-gold-200 bg-gold-50 px-4 py-3.5">
            <RefreshCw className="mt-0.5 size-5 shrink-0 text-gold-700" />
            <p className="text-[12.5px] leading-relaxed text-gold-900">{state.message}</p>
          </div>
          <Button fullWidth size="lg" loading={checking} onClick={() => void verify()}>
            Check payment status again
          </Button>
          <ButtonLink to="/products" variant="outline" fullWidth>
            Continue shopping
          </ButtonLink>
        </div>
      )}

      {state.kind === 'missing' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3.5">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <p className="text-[12.5px] leading-relaxed text-red-700">
              We could not find a payment reference in this link. Open your order to check its status or try the
              payment again.
            </p>
          </div>
          <ButtonLink to="/products" fullWidth>
            Continue shopping
          </ButtonLink>
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-red-50 px-4 py-3.5">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <p className="text-[12.5px] leading-relaxed text-red-700">{state.message}</p>
          </div>
          {state.orderId ? (
            <ButtonLink to={`/checkout/success/${state.orderId}`} fullWidth>
              View order and retry payment
            </ButtonLink>
          ) : (
            <ButtonLink to="/products" fullWidth>
              Continue shopping
            </ButtonLink>
          )}
          <p className="text-center text-[11px] text-slate-warm">
            No order is marked paid until the provider confirms the amount and transaction reference.
          </p>
        </div>
      )}

      {state.kind === 'verifying' && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-warm">
          <CheckCircle2 className="size-3.5 text-emerald-600" /> Payments are verified server-side for your
          protection.
        </p>
      )}
    </AuthLayout>
  );
}
