import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, formatSantim } from '@/lib/format';

interface Suggestions {
  products: { id: string; name: string; slug: string; priceSantim: number; imageUrl: string | null; brandName: string | null }[];
  categories: { id: string; name: string; slug: string }[];
  brands: { id: string; name: string; slug: string }[];
}

export function SearchBox({
  className,
  autoFocus,
  onNavigate,
  onClose,
}: {
  className?: string;
  autoFocus?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['suggest', debounced],
    queryFn: () => api.get<Suggestions>('/products/suggest', { q: debounced }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });

  const submit = (value: string) => {
    const query = value.trim();
    if (!query) return;
    setOpen(false);
    onNavigate?.();
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const hasResults =
    Boolean(data) &&
    ((data?.products.length ?? 0) > 0 || (data?.categories.length ?? 0) > 0 || (data?.brands.length ?? 0) > 0);

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(term);
        }}
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
        <input
          value={term}
          autoFocus={autoFocus}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              onClose?.();
            }
          }}
          placeholder="Search products, brands and categories"
          aria-label="Search products"
          className="h-11 w-full rounded-xl border border-line bg-cream/70 pl-10 pr-20 text-sm text-ink placeholder:text-slate-warm/70 transition focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-900/10"
        />
        <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {term && (
            <button
              type="button"
              onClick={() => {
                setTerm('');
                setDebounced('');
              }}
              className="grid size-8 place-items-center rounded-full text-slate-warm hover:bg-sand"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
          <button
            type="submit"
            className="grid size-8 place-items-center rounded-lg bg-brand-900 text-white transition hover:bg-brand-800"
            aria-label="Search"
          >
            <Search className="size-3.5" />
          </button>
        </div>
      </form>

      {open && debounced.length >= 2 && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
          {isFetching && !data ? (
            <p className="px-4 py-6 text-center text-sm text-slate-warm">Searching…</p>
          ) : hasResults ? (
            <div className="max-h-[420px] overflow-y-auto">
              {data!.products.length > 0 && (
                <div className="border-b border-line/70 p-2">
                  {data!.products.map((product) => (
                    <Link
                      key={product.id}
                      to={`/product/${product.slug}`}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-cream"
                    >
                      <span className="size-11 shrink-0 overflow-hidden rounded-lg bg-sand">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-brand-900">{product.name}</span>
                        <span className="text-xs text-slate-warm">
                          {product.brandName ?? 'Nile Mart'} · {formatSantim(product.priceSantim)}
                        </span>
                      </span>
                      <ArrowUpRight className="size-3.5 text-slate-warm" />
                    </Link>
                  ))}
                </div>
              )}
              {(data!.categories.length > 0 || data!.brands.length > 0) && (
                <div className="grid gap-1 p-2 sm:grid-cols-2">
                  {data!.categories.map((category) => (
                    <Link
                      key={category.id}
                      to={`/category/${category.slug}`}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
                      className="rounded-lg px-2.5 py-2 text-sm text-slate-warm transition hover:bg-cream hover:text-brand-900"
                    >
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-700">Category</span>
                      {category.name}
                    </Link>
                  ))}
                  {data!.brands.map((brand) => (
                    <Link
                      key={brand.id}
                      to={`/products?brand=${brand.slug}`}
                      onClick={() => {
                        setOpen(false);
                        onNavigate?.();
                      }}
                      className="rounded-lg px-2.5 py-2 text-sm text-slate-warm transition hover:bg-cream hover:text-brand-900"
                    >
                      <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-gold-700">Brand</span>
                      {brand.name}
                    </Link>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => submit(term)}
                className="block w-full border-t border-line/70 bg-cream/60 px-4 py-3 text-left text-sm font-semibold text-brand-900 hover:bg-cream"
              >
                View all results for “{term.trim()}”
              </button>
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-semibold text-brand-900">No matches for “{debounced}”</p>
              <p className="mt-1 text-xs text-slate-warm">Try a different spelling or browse all products.</p>
              <Link
                to="/products"
                onClick={() => setOpen(false)}
                className="mt-3 inline-block text-xs font-semibold text-brand-700 underline decoration-gold-400 underline-offset-4"
              >
                Browse all products
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
