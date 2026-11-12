import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { safeNext } from '@/components/auth/RequireAuth';
import { Button, Field, Input } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/stores/auth';
import { useToasts } from '@/stores/toasts';

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const login = useAuth((state) => state.login);
  const navigate = useNavigate();
  const push = useToasts((state) => state.push);
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  useSeo({ title: 'Sign in', description: 'Sign in to your Nile Mart account.', canonicalPath: '/login', noIndex: true });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const user = await login(values.email, values.password);
      push(`Welcome back, ${user.fullName.split(' ')[0]}.`);
      navigate(user.isStaff && next === '/account' ? '/admin' : next, { replace: true });
    } catch (error) {
      setServerError(errorMessage(error));
    }
  });

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to track orders, save favourites and check out faster."
      footer={
        <>
          New to Nile Mart?{' '}
          <Link
            to={`/register${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}
            className="font-semibold text-brand-900 underline decoration-gold-400 decoration-2 underline-offset-4"
          >
            Create an account
          </Link>
        </>
      }
    >
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

        <Field label="Password" error={errors.password?.message}>
          {({ id }) => (
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
              <Input
                id={id}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Your password"
                className="pl-10 pr-11"
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

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[12.5px] text-slate-warm">
            <input type="checkbox" className="size-4 rounded border-line accent-brand-900" defaultChecked />
            Keep me signed in
          </label>
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-semibold text-brand-900 underline decoration-gold-400 underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
          Sign in
        </Button>

        {import.meta.env.DEV && (
          <div className="rounded-xl border border-dashed border-line bg-cream/70 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-warm">
              Development demo accounts
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                className="rounded-md bg-white px-2 py-1 font-medium text-brand-900 shadow-sm"
                onClick={() => {
                  setValue('email', 'customer@nilemart.et');
                  setValue('password', 'Customer#2026');
                }}
              >
                Customer
              </button>
              <button
                type="button"
                className="rounded-md bg-white px-2 py-1 font-medium text-brand-900 shadow-sm"
                onClick={() => {
                  setValue('email', 'admin@nilemart.et');
                  setValue('password', 'NileMart#2026');
                }}
              >
                Admin
              </button>
            </div>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}
