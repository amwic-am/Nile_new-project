import { Navigate, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/stores/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

export function RequireStaff({ children }: { children: React.ReactNode }) {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);

  if (status === 'loading') {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner />
      </div>
    );
  }

  if (!user) return <Navigate to="/login?next=%2Fadmin" replace />;
  if (!user.isStaff) return <Navigate to="/account" replace />;
  return <>{children}</>;
}

export function safeNext(value: string | null, fallback = '/account') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
