import { useEffect, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { Button, Input, Stars } from '@/components/ui';
import { cx, formatSantim } from '@/lib/format';
import type { ProductListResult } from '@/lib/types';

export interface CatalogFilters {
  brands: string[];
  colors: string[];
  sizes: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock: boolean;
}

interface FilterPanelProps {
  facets: ProductListResult['facets'];
  filters: CatalogFilters;
  onToggleBrand: (slug: string) => void;
  onToggleAttribute: (name: 'colors' | 'sizes', value: string) => void;
  onPrice: (min?: number, max?: number) => void;
  onRating: (rating?: number) => void;
  onStock: (inStock: boolean) => void;
  onClear: () => void;
  activeCount: number;
}

export function FilterPanel({
  facets,
  filters,
  onToggleBrand,
  onToggleAttribute,
  onPrice,
  onRating,
  onStock,
  onClear,
  activeCount,
}: FilterPanelProps) {
  const [minPrice, setMinPrice] = useState(filters.minPrice ? String(filters.minPrice / 100) : '');
  const [maxPrice, setMaxPrice] = useState(filters.maxPrice ? String(filters.maxPrice / 100) : '');

  useEffect(() => {
    setMinPrice(filters.minPrice ? String(filters.minPrice / 100) : '');
    setMaxPrice(filters.maxPrice ? String(filters.maxPrice / 100) : '');
  }, [filters.minPrice, filters.maxPrice]);

  const applyPrice = () => {
    const min = minPrice ? Math.max(0, Math.round(Number(minPrice) * 100)) : undefined;
    const max = maxPrice ? Math.max(0, Math.round(Number(maxPrice) * 100)) : undefined;
    onPrice(Number.isFinite(min) ? min : undefined, Number.isFinite(max) ? max : undefined);
  };

  const attributeGroups = (facets?.attributes ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-brand-900">
          Filters {activeCount > 0 && <span className="text-gold-700">({activeCount})</span>}
        </p>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[12px] font-semibold text-slate-warm underline decoration-gold-400 underline-offset-4 hover:text-brand-900"
          >
            Clear all
          </button>
        )}
      </div>

      <section>
        <FilterHeading title="Availability" />
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-warm">
          <input
            type="checkbox"
            checked={filters.inStock}
            onChange={(event) => onStock(event.target.checked)}
            className="size-4 rounded border-line accent-brand-900"
          />
          In stock only
        </label>
      </section>

      <section>
        <FilterHeading title="Price (ETB)" />
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            placeholder={facets ? String(Math.floor(facets.priceMin / 100)) : 'Min'}
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Minimum price"
            className="h-10 text-[13px]"
          />
          <span className="text-slate-warm">–</span>
          <Input
            inputMode="numeric"
            placeholder={facets ? String(Math.ceil(facets.priceMax / 100)) : 'Max'}
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Maximum price"
            className="h-10 text-[13px]"
          />
        </div>
        <Button size="sm" variant="secondary" className="mt-2" onClick={applyPrice}>
          Apply price
        </Button>
        {facets && facets.priceMin > 0 && (
          <p className="mt-2 text-[11px] text-slate-warm">
            Range in catalogue: {formatSantim(facets.priceMin)} – {formatSantim(facets.priceMax)}
          </p>
        )}
      </section>

      {facets && facets.brands.length > 0 && (
        <section>
          <FilterHeading title="Brand" />
          <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {facets.brands.map((brand) => (
              <li key={brand.slug}>
                <label className="flex cursor-pointer items-center justify-between gap-2 text-[13px] text-slate-warm">
                  <span className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={filters.brands.includes(brand.slug)}
                      onChange={() => onToggleBrand(brand.slug)}
                      className="size-4 rounded border-line accent-brand-900"
                    />
                    {brand.name}
                  </span>
                  <span className="text-[11px] text-slate-warm/70">{brand.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attributeGroups.map((group) => {
        const key: 'colors' | 'sizes' | null = /colou?r/i.test(group.name)
          ? 'colors'
          : /size/i.test(group.name)
            ? 'sizes'
            : null;
        if (!key) return null;
        return (
          <section key={group.name}>
            <FilterHeading title={group.name} />
            <div className="flex flex-wrap gap-1.5">
              {group.values.map((item) => {
                const active = filters[key].includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => onToggleAttribute(key, item.value)}
                    className={cx(
                      'rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition',
                      active
                        ? 'border-brand-900 bg-brand-900 text-white'
                        : 'border-line bg-white text-slate-warm hover:border-brand-900/30 hover:text-brand-900',
                    )}
                  >
                    {item.value}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <section>
        <FilterHeading title="Rating" />
        <div className="space-y-1.5">
          {[4, 3, 2].map((rating) => (
            <label key={rating} className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-warm">
              <input
                type="radio"
                name="rating"
                checked={filters.rating === rating}
                onChange={() => onRating(rating)}
                className="size-4 accent-brand-900"
              />
              <span className="flex items-center gap-1.5">
                <Stars value={rating} size={12} label={false} />
                {rating} & up
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-warm">
            <input
              type="radio"
              name="rating"
              checked={!filters.rating}
              onChange={() => onRating(undefined)}
              className="size-4 accent-brand-900"
            />
            Any rating
          </label>
        </div>
      </section>
    </div>
  );
}

function FilterHeading({ title }: { title: string }) {
  return <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-warm">{title}</h3>;
}

export function MobileFilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900"
    >
      <SlidersHorizontal className="size-4" /> Filters
      {count > 0 && (
        <span className="grid size-5 place-items-center rounded-full bg-brand-900 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </button>
  );
}

export function MobileFilterSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] lg:hidden">
      <div className="absolute inset-0 bg-brand-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-slide-in absolute inset-y-0 right-0 flex w-[90%] max-w-sm flex-col bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="font-display text-lg font-bold">Filter products</p>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full text-slate-warm hover:bg-sand"
            aria-label="Close filters"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        <div className="border-t border-line p-4">
          <Button fullWidth onClick={onClose}>
            Show results
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SortSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative flex items-center gap-2 text-[12.5px] text-slate-warm">
      <span className="hidden sm:inline">Sort by</span>
      <span className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 appearance-none rounded-xl border border-line bg-white pl-3 pr-9 text-[13px] font-semibold text-brand-900 focus:border-brand-400 focus:outline-none"
          aria-label="Sort products"
        >
          <option value="popular">Most popular</option>
          <option value="newest">Newest arrivals</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
          <option value="rating">Top rated</option>
          <option value="discount">Biggest discount</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-warm" />
      </span>
    </label>
  );
}
