import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Package, Plus, Upload } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  DataTable,
  ErrorNotice,
  SearchField,
  SelectField,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Pagination } from '@/components/ui';
import { adminCsvUrl, useAdminBrands, useAdminCategories, useAdminProducts } from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatDate, formatSantim } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

export default function AdminProductsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const categoryId = params.get('categoryId') ?? '';
  const brandId = params.get('brandId') ?? '';
  const sort = params.get('sort') ?? 'recent';
  const lowStock = params.get('lowStock') ?? '';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const canImport = permissions.includes('products.write') && permissions.includes('inventory.write');

  const categories = useAdminCategories();
  const brands = useAdminBrands();

  useEffect(() => setSearch(q), [q]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    if (!('page' in next)) merged.delete('page');
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === q) return;
      update({ q: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = useMemo(
    () => ({
      q: q || undefined,
      status,
      categoryId: categoryId || undefined,
      brandId: brandId || undefined,
      sort,
      lowStock: lowStock || undefined,
      page,
      pageSize: 20,
    }),
    [q, status, categoryId, brandId, sort, lowStock, page],
  );

  const { data, isLoading, isError, error, refetch } = useAdminProducts(query);

  async function importCsv(file: File) {
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const result = await api.post<{ summary: { created: number; updated: number; skipped: number; total: number } }>(
        '/admin/products/import',
        form,
      );
      toast(
        `Import finished: ${result.summary.created} created, ${result.summary.updated} updated, ${result.summary.skipped} skipped.`,
      );
      void refetch();
    } catch (importError) {
      toast(errorMessage(importError), 'error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Products"
        description="Manage the catalogue, variants, imagery and publishing state. Stock quantities live in Inventory."
        eyebrow="Commerce"
        actions={
          <>
            <a
              href={adminCsvUrl('products/export')}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30"
            >
              <Download className="size-4 text-gold-700" /> Export
            </a>
            {canImport && (
              <Button
                variant="outline"
                size="md"
                loading={importing}
                iconLeft={<Upload className="size-4" />}
                onClick={() => fileRef.current?.click()}
              >
                Import
              </Button>
            )}
            <Link
              to="/admin/products/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-900 px-5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              <Plus className="size-4" /> New product
            </Link>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="text/csv,.csv"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importCsv(file);
          event.target.value = '';
        }}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search name, SKU or barcode"
          className="w-full sm:w-72"
        />
        <SelectField
          label="Status"
          value={status}
          onChange={(next) => update({ status: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'draft', label: 'Draft' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
        <SelectField
          label="Category"
          value={categoryId}
          onChange={(next) => update({ categoryId: next || null })}
          options={[
            { value: '', label: 'All categories' },
            ...(categories.data?.categories ?? []).map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
        />
        <SelectField
          label="Brand"
          value={brandId}
          onChange={(next) => update({ brandId: next || null })}
          options={[
            { value: '', label: 'All brands' },
            ...(brands.data?.brands ?? []).map((brand) => ({ value: brand.id, label: brand.name })),
          ]}
        />
        <SelectField
          label="Sort"
          value={sort}
          onChange={(next) => update({ sort: next })}
          options={[
            { value: 'recent', label: 'Recently updated' },
            { value: 'name', label: 'Name A–Z' },
            { value: 'price', label: 'Highest price' },
            { value: 'stock', label: 'Lowest stock' },
            { value: 'sales', label: 'Best selling' },
          ]}
        />
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-[12.5px] font-semibold text-slate-warm">
          <input
            type="checkbox"
            className="size-4 accent-brand-900"
            checked={lowStock === 'true'}
            onChange={(event) => update({ lowStock: event.target.checked ? 'true' : null })}
          />
          Low stock only
        </label>
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading products…" />
      ) : !data.products.length ? (
        <div className="surface">
          <EmptyState
            icon={<Package className="size-6" />}
            title="No products found"
            description="Adjust the filters, or create a new product to get started."
            action={
              <Link
                to="/admin/products/new"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-900 px-5 text-sm font-semibold text-white"
              >
                <Plus className="size-4" /> New product
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th>Status</Th>
                <Th align="right">Price</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Sold</Th>
                <Th>Updated</Th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((product) => (
                <tr key={product.id} className="transition hover:bg-cream/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt="" className="size-11 rounded-lg object-cover" />
                      ) : (
                        <div className="grid size-11 place-items-center rounded-lg bg-sand text-slate-warm">
                          <Package className="size-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <Link
                          to={`/admin/products/${product.id}`}
                          className="block truncate text-[13px] font-semibold text-brand-900 hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="text-[11.5px] text-slate-warm">
                          {product.sku} · {product.variantCount}{' '}
                          {product.variantCount === 1 ? 'variant' : 'variants'}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-[12.5px] text-slate-warm">
                    {product.categoryName ?? 'Uncategorised'}
                    {product.brandName && (
                      <span className="block text-[11px] text-slate-warm/80">{product.brandName}</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={product.status} />
                      {product.isFeatured && <Badge tone="gold">Featured</Badge>}
                    </div>
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    <span className="font-semibold text-brand-900">{formatSantim(product.basePrice)}</span>
                    {product.compareAtPrice && (
                      <span className="block text-[11px] text-slate-warm line-through">
                        {formatSantim(product.compareAtPrice)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <span
                      className={
                        product.totalStock <= 0
                          ? 'font-semibold text-red-600'
                          : product.totalStock < 10
                            ? 'font-semibold text-amber-700'
                            : 'text-brand-900'
                      }
                    >
                      {product.totalStock}
                    </span>
                  </Td>
                  <Td align="right" className="text-[12.5px] text-slate-warm">
                    {product.soldCount}
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">{formatDate(product.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(next) => update({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}
