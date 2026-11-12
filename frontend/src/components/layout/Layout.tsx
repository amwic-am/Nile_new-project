import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { Spinner, Toaster } from '@/components/ui';
import { useAuth } from '@/stores/auth';
import { useWishlist } from '@/stores/wishlist';

function ScrollToTop() {
  const { pathname, search } = useLocation();
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, search]);
  return null;
}

export function Layout() {
  const loadAuth = useAuth((state) => state.load);
  const userId = useAuth((state) => state.user?.id ?? null);
  const status = useAuth((state) => state.status);
  const queryClient = useQueryClient();
  const resetWishlist = useWishlist((state) => state.reset);

  useEffect(() => {
    void loadAuth();
  }, [loadAuth]);

  useEffect(() => {
    if (status === 'loading') return;
    void queryClient.invalidateQueries({ queryKey: ['cart'] });
    if (!userId) resetWishlist();
  }, [userId, status, queryClient, resetWishlist]);

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand-900 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1">
        <Suspense
          fallback={
            <div className="container-page flex min-h-[60vh] items-center justify-center">
              <Spinner />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
