import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Home, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import {
  FilterPanel,
  MobileFilterButton,
  MobileFilterSheet,
  SortSelect,
  type CatalogFilters,
} from '@/components/catalog/FilterPanel';
import { ProductCardSkeleton, ProductGrid } from '@/components/product/ProductCard';
import { Button, EmptyState, Pagination } from '@/components/ui';
import { useCategories, useProducts } from '@/lib/queries';
import { breadcrumbJsonLd, useSeo } from '@/lib/seo';
import { cx } from '@/lib/format';
import type { CategoryNode } from '@/lib/types';

function splitParam(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function findCategory(nodes: CategoryNode[], slug: string | undefined): CategoryNode | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const child = findCategory(node.children, slug);
    if (child) return child;
  }
  return null;
}

function findParent(nodes: CategoryNode[], slug: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.children.some((child) => child.slug === slug)) return node;
    const nested = findParent(node.children, slug);
    if (nested) return nested;
  }
  return null;
}

export default function CatalogPage({ mode }: { mode: 'all' | 'category' | 'search' }) {
  const params = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mobileFilters, setMobileFilters] = useState(false);
  const { data: categoryData } = useCategories();

  const categorySlug = mode === 'category' ? params.slug : searchParams.get('category') || undefined;
  const q = mode === 'search' ? searchParams.get('q') || '' : searchParams.get('q') || undefined;
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const sortParam = searchParams.get('sort') || (q ? 'relevance' : 'popular');
  const filters: CatalogFilters = useMemo(
    () => ({
      brands: splitParam(searchParams, 'brand'),
      colors: splitParam(searchParams, 'colors'),
      sizes: splitParam(searchParams, 'sizes'),
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      rating: searchParams.get('rating') ? Number(searchParams.get('rating')) : undefined,
      inStock: searchParams.get('inStock') === 'true',
    }),
    [searchParams],
  );

  const deals = searchParams.get('deals') === 'true';
  const featured = searchParams.get('featured') === 'true';

  const { data, isLoading, isFetching, isError, refetch } = useProducts({
    q,
    category: categorySlug,
    brand: filters.brands,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    rating: filters.rating,
    inStock: filters.inStock,
    colors: filters.colors,
    sizes: filters.sizes,
    deals,
    featured,
    sort: sortParam,
    page,
    pageSize: 24,
  });

  const currentCategory = findCategory(categoryData?.categories ?? [], categorySlug);
  const parentCategory = currentCategory ? findParent(categoryData?.categories ?? [], currentCategory.slug) : null;

  const title =
    mode === 'search'
      ? q
        ? `Search results for “${q}”`
        : 'Search Nile Mart'
      : currentCategory
        ? currentCategory.name
        : deals
          ? 'Deals'
          : featured
            ? 'Featured products'
            : 'All products';

  const description =
    currentCategory?.description ||
    (mode === 'search'
      ? `Browse products matching “${q}” at Nile Mart. Genuine products with delivery across Ethiopia.`
      : 'Explore the full Nile Mart catalogue: electronics, fashion, home, beauty, sports and office essentials.');

  useSeo({
    title: mode === 'search' && q ? `${title}` : `${title} | Nile Mart`,
    description,
    canonicalPath:
      mode === 'category' && currentCategory
        ? `/category/${currentCategory.slug}`
        : mode === 'search' && q
          ? `/search?q=${encodeURIComponent(q)}`
          : '/products',
    image: data?.items[0]?.imageUrl ?? null,
    jsonLd:
      mode === 'category' && currentCategory
        ? breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: 'Shop', path: '/products' },
            ...(parentCategory ? [{ name: parentCategory.name, path: `/category/${parentCategory.slug}` }] : []),
            { name: currentCategory.name, path: `/category/${currentCategory.slug}` },
          ])
        : breadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: title, path: q ? `/search?q=${encodeURIComponent(q)}` : '/products' },
          ]),
  });

  const update = (patch: Record<string, string | string[] | undefined>, options: { keepPage?: boolean } = {}) => {
    const next = new URLSearchParams(searchParams);
    if (!options.keepPage) next.delete('page');
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (Array.isArray(value)) {
        if (value.length) next.set(key, value.join(','));
      } else if (value !== undefined && value !== '') {
        next.set(key, value);
      }
    }
    setSearchParams(next, { replace: true });
  };

  const toggleBrand = (slug: string) => {
    const brands = filters.brands.includes(slug)
      ? filters.brands.filter((item) => item !== slug)
      : [...filters.brands, slug];
    update({ brand: brands });
  };

  const toggleAttribute = (name: 'colors' | 'sizes', value: string) => {
    const current = filters[name];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    update({ [name]: next });
  };

  const clearAll = () => {
    const next = new URLSearchParams(searchParams);
    for (const key of ['brand', 'colors', 'sizes', 'minPrice', 'maxPrice', 'rating', 'inStock', 'deals', 'featured', 'page']) {
      next.delete(key);
    }
    setSearchParams(next, { replace: true });
  };

  const activeCount =
    filters.brands.length +
    filters.colors.length +
    filters.sizes.length +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    (filters.rating ? 1 : 0) +
    (filters.inStock ? 1 : 0) +
    (deals ? 1 : 0) +
    (featured ? 1 : 0);

  const brandName = (slug: string) =>
    data?.facets?.brands.find((brand) => brand.slug === slug)?.name ?? slug;

  const changePage = (nextPage: number) => {
    update({ page: String(nextPage) }, { keepPage: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filterPanel = (
    <FilterPanel
      facets={data?.facets}
      filters={filters}
      onToggleBrand={toggleBrand}
      onToggleAttribute={toggleAttribute}
      onPrice={(min, max) =>
        update({
          minPrice: min ? String(min) : undefined,
          maxPrice: max ? String(max) : undefined,
        })
      }
      onRating={(rating) => update({ rating: rating ? String(rating) : undefined })}
      onStock={(inStock) => update({ inStock: inStock ? 'true' : undefined })}
      onClear={clearAll}
      activeCount={activeCount}
    />
  );

  return (
    <div className="container-page pt-5 sm:pt-7">
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-warm" aria-label="Breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-brand-900">
          <Home className="size-3.5" /> Home
        </Link>
        <ChevronRight className="size-3" />
        {mode === 'category' && currentCategory ? (
          <>
            {parentCategory && (
              <>
                <Link to={`/category/${parentCategory.slug}`} className="hover:text-brand-900">
                  {parentCategory.name}
                </Link>
                <ChevronRight className="size-3" />
              </>
            )}
            <span className="font-medium text-brand-900">{currentCategory.name}</span>
          </>
        ) : mode === 'search' ? (
          <span className="font-medium text-brand-900">Search</span>
        ) : (
          <span className="font-medium text-brand-900">All products</span>
        )}
      </nav>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-2">
            {mode === 'search' ? 'Search' : deals ? 'Limited-time offers' : featured ? 'Editor’s picks' : 'The catalogue'}
          </p>
          <h1 className="text-[26px] font-extrabold leading-tight sm:text-[32px]">{title}</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-warm">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <MobileFilterButton count={activeCount} onClick={() => setMobileFilters(true)} />
          <SortSelect
            value={sortParam}
            onChange={(value) => update({ sort: value === 'popular' ? undefined : value })}
          />
        </div>
      </header>

      {currentCategory?.children.length ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/products"
            className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-slate-warm transition hover:border-brand-900/30 hover:text-brand-900"
          >
            All products
          </Link>
          {currentCategory.children.map((child) => (
            <Link
              key={child.id}
              to={`/category/${child.slug}`}
              className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-slate-warm transition hover:border-brand-900/30 hover:text-brand-900"
            >
              {child.name}
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-[128px] max-h-[calc(100vh-150px)] overflow-y-auto rounded-2xl border border-line bg-white p-4 shadow-soft">
            {filterPanel}
          </div>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12.5px] text-slate-warm">
              {isLoading ? 'Loading products…' : `${data?.total ?? 0} ${data?.total === 1 ? 'product' : 'products'}`}
              {isFetching && !isLoading && <span className="ml-2 text-slate-warm/60">updating…</span>}
            </p>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 text-[12px] font-semibold text-brand-900"
              >
                <X className="size-3.5" /> Clear filters ({activeCount})
              </button>
            )}
          </div>

          {activeCount > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {filters.brands.map((slug) => (
                <FilterChip key={`brand-${slug}`} label={brandName(slug)} onRemove={() => toggleBrand(slug)} />
              ))}
              {filters.colors.map((value) => (
                <FilterChip key={`color-${value}`} label={value} onRemove={() => toggleAttribute('colors', value)} />
              ))}
              {filters.sizes.map((value) => (
                <FilterChip key={`size-${value}`} label={value} onRemove={() => toggleAttribute('sizes', value)} />
              ))}
              {(filters.minPrice || filters.maxPrice) && (
                <FilterChip
                  label="Price range"
                  onRemove={() => update({ minPrice: undefined, maxPrice: undefined })}
                />
              )}
              {filters.rating && (
                <FilterChip label={`${filters.rating}★ & up`} onRemove={() => update({ rating: undefined })} />
              )}
              {filters.inStock && <FilterChip label="In stock" onRemove={() => update({ inStock: undefined })} />}
              {deals && <FilterChip label="Deals" onRemove={() => update({ deals: undefined })} />}
              {featured && <FilterChip label="Featured" onRemove={() => update({ featured: undefined })} />}
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<PackageSearch className="size-6" />}
              title="We could not load these products"
              description="Please check your connection and try again."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : data && data.items.length > 0 ? (
            <>
              <ProductGrid products={data.items} />
              <div className="mt-10 flex justify-center">
                <Pagination page={data.page} totalPages={data.totalPages} onChange={changePage} />
              </div>
            </>
          ) : (
            <EmptyState
              icon={<PackageSearch className="size-6" />}
              title={q ? `No products match “${q}”` : 'No products match these filters'}
              description="Try removing a filter or searching for something broader."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {activeCount > 0 && (
                    <Button variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  )}
                  <Button onClick={() => update({ q: undefined })}>Browse all products</Button>
                </div>
              }
            />
          )}
        </div>
      </div>

      <MobileFilterSheet open={mobileFilters} onClose={() => setMobileFilters(false)}>
        {filterPanel}
      </MobileFilterSheet>

      <div className="mt-12 flex flex-col items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-5 sm:flex-row">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-cream text-brand-800">
            <SlidersHorizontal className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-900">Not finding what you need?</p>
            <p className="text-xs text-slate-warm">Our team can source specific models and sizes.</p>
          </div>
        </div>
        <Link
          to="/contact"
          className={cx(
            'rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30',
          )}
        >
          Ask Nile Mart
        </Link>
      </div>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-white py-1 pl-2.5 pr-1 text-[11.5px] font-medium text-brand-900">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="grid size-5 place-items-center rounded-full text-slate-warm hover:bg-sand"
        aria-label={`Remove ${label} filter`}
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
