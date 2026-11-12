import { Link } from 'react-router-dom';
import { Compass, Search, ShoppingBag } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { useSeo } from '@/lib/seo';

export default function NotFoundPage() {
  useSeo({
    title: 'Page not found',
    description: 'The page you are looking for does not exist or has moved.',
    noIndex: true,
  });

  return (
    <div className="container-page py-16 sm:py-24">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-sand text-brand-900">
          <Compass className="size-7" />
        </div>
        <p className="mt-6 font-display text-[64px] font-extrabold leading-none text-brand-900">404</p>
        <h1 className="mt-2 text-2xl font-bold">This page took a different route</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-warm">
          The page you are looking for may have moved, or the link may be out of date. Try searching for what you
          need or start from the storefront.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <ButtonLink to="/" iconLeft={<ShoppingBag className="size-4" />}>
            Back to home
          </ButtonLink>
          <ButtonLink to="/products" variant="outline" iconLeft={<Search className="size-4" />}>
            Browse products
          </ButtonLink>
        </div>
        <p className="mt-8 text-[12px] text-slate-warm">
          Need a hand?{' '}
          <Link to="/contact" className="font-semibold text-brand-900 underline underline-offset-2">
            Contact customer care
          </Link>
        </p>
      </div>
    </div>
  );
}
