import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Mail, PencilLine, Plus, Tag, Trash2, TicketPercent } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  AdminTabs,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  ImageUploadField,
  Panel,
  SearchField,
  SelectField,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
  humanize,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Field, Input, Modal, Pagination, Select, Textarea } from '@/components/ui';
import {
  adminCsvUrl,
  useAdminBanners,
  useAdminCategories,
  useAdminCoupon,
  useAdminCoupons,
  useAdminInvalidate,
  useAdminProducts,
  useAdminSubscribers,
} from '@/lib/admin';
import type { AdminCoupon, AdminCouponDetail } from '@/lib/admin';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { formatDate, formatDateTime, formatSantim } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toasts';

type Tab = 'coupons' | 'banners' | 'newsletter';

const ADDRESS_TIMEZONE = 'Africa/Addis_Ababa';

function toDateTimeInput(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADDRESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function fromDateTimeInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}:00+03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function couponValueLabel(coupon: Pick<AdminCoupon, 'discountType' | 'discountValue'>) {
  return coupon.discountType === 'percentage'
    ? `${coupon.discountValue}% off`
    : `${formatSantim(Math.round(coupon.discountValue * 100))} off`;
}

export default function AdminPromotionsPage() {
  const [params, setParams] = useSearchParams();
  const user = useAuth((state) => state.user);
  const canWrite = Boolean(user?.permissions.includes('promotions.write'));
  const tab = (params.get('tab') as Tab | null) ?? 'coupons';

  const setTab = (next: Tab) => {
    const merged = new URLSearchParams(params);
    merged.set('tab', next);
    setParams(merged, { replace: true });
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Marketing"
        title="Promotions"
        description="Discount codes, storefront banners and the newsletter audience. Codes are validated and redeemed server-side."
      />

      <AdminTabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'coupons', label: 'Discount codes' },
          { key: 'banners', label: 'Banners' },
          { key: 'newsletter', label: 'Newsletter' },
        ]}
      />

      {tab === 'coupons' ? (
        <CouponsTab canWrite={canWrite} />
      ) : tab === 'banners' ? (
        <BannersTab canWrite={canWrite} />
      ) : (
        <NewsletterTab canWrite={canWrite} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Coupons */

function CouponsTab({ canWrite }: { canWrite: boolean }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const status = params.get('status') ?? 'all';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);
  const [editor, setEditor] = useState<{ open: boolean; couponId: string | null }>({
    open: false,
    couponId: null,
  });
  const [deleting, setDeleting] = useState<AdminCoupon | null>(null);

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

  const query = useMemo(() => ({ q: q || undefined, status, page, pageSize: 25 }), [q, status, page]);
  const { data, isLoading, isError, error, refetch } = useAdminCoupons(query);
  const invalidate = useAdminInvalidate();

  async function toggle(coupon: AdminCoupon) {
    try {
      await api.patch(`/admin/coupons/${coupon.id}`, { isActive: !coupon.isActive });
      toast(coupon.isActive ? 'Discount code deactivated' : 'Discount code activated');
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.delete(`/admin/coupons/${deleting.id}`);
      toast('Discount code deleted');
      setDeleting(null);
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Code or description" className="w-full sm:w-72" />
        <SelectField
          label="Status"
          value={status}
          onChange={(next) => update({ status: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'scheduled', label: 'Scheduled' },
            { value: 'expired', label: 'Expired' },
            { value: 'exhausted', label: 'Exhausted' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
        <a
          href={adminCsvUrl('coupons/export')}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30"
        >
          <Download className="size-4 text-gold-700" /> Export CSV
        </a>
        <div className="ml-auto">
          <Button
            iconLeft={<Plus className="size-4" />}
            onClick={() => setEditor({ open: true, couponId: null })}
            disabled={!canWrite}
          >
            New discount code
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading discount codes…" />
      ) : !data.coupons.length ? (
        <div className="surface">
          <EmptyState
            icon={<TicketPercent className="size-6" />}
            title="No discount codes yet"
            description="Create a percentage or fixed-amount code and optionally limit it to products or categories."
            action={
              canWrite ? (
                <Button iconLeft={<Plus className="size-4" />} onClick={() => setEditor({ open: true, couponId: null })}>
                  New discount code
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[1000px]">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Discount</Th>
                <Th>Applies to</Th>
                <Th align="right">Minimum</Th>
                <Th align="right">Redeemed</Th>
                <Th>Status</Th>
                <Th>Window</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.coupons.map((coupon) => (
                <tr key={coupon.id} className="transition hover:bg-cream/50">
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-mono text-[13px] font-bold text-brand-900">{coupon.code}</span>
                      {!coupon.isActive && <Badge tone="outline">Off</Badge>}
                    </span>
                    {coupon.description && (
                      <p className="mt-0.5 max-w-[220px] text-[11.5px] text-slate-warm">{coupon.description}</p>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap font-semibold text-brand-900">
                    {couponValueLabel(coupon)}
                    {coupon.maxDiscount ? (
                      <p className="text-[11px] font-normal text-slate-warm">
                        max {formatSantim(coupon.maxDiscount)}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-[12px] capitalize text-slate-warm">{coupon.appliesTo}</Td>
                  <Td align="right" className="whitespace-nowrap text-[12.5px]">
                    {coupon.minOrder > 0 ? formatSantim(coupon.minOrder) : '—'}
                  </Td>
                  <Td align="right" className="whitespace-nowrap text-[12.5px]">
                    {coupon.usedCount}
                    {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                    <p className="text-[11px] text-slate-warm">
                      {formatSantim(coupon.discountGiven)} given
                    </p>
                  </Td>
                  <Td>
                    <StatusBadge status={coupon.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-[11.5px] text-slate-warm">
                    {coupon.startsAt ? formatDate(coupon.startsAt) : 'Anytime'}
                    {' → '}
                    {coupon.endsAt ? formatDate(coupon.endsAt) : 'No end'}
                  </Td>
                  <Td align="right">
                    {canWrite ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditor({ open: true, couponId: coupon.id })}
                          iconLeft={<PencilLine className="size-3.5" />}
                        >
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void toggle(coupon)}>
                          {coupon.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleting(coupon)}
                          aria-label={`Delete ${coupon.code}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11.5px] text-slate-warm">Read only</span>
                    )}
                  </Td>
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

      {editor.open && (
        <CouponEditor
          couponId={editor.couponId}
          onClose={() => setEditor({ open: false, couponId: null })}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete discount code"
        confirmLabel="Delete code"
        destructive
        description={
          <>
            Delete <strong className="text-brand-900">{deleting?.code}</strong>? Codes with redemptions cannot be
            deleted — deactivate them instead.
          </>
        }
      />
    </div>
  );
}

interface CouponForm {
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: string;
  minOrder: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perUserLimit: string;
  isActive: boolean;
  appliesTo: 'all' | 'products' | 'categories';
  productIds: string[];
  categoryIds: string[];
}

const emptyCouponForm: CouponForm = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: '',
  minOrder: '',
  maxDiscount: '',
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  perUserLimit: '1',
  isActive: true,
  appliesTo: 'all',
  productIds: [],
  categoryIds: [],
};

function couponDetailToForm(coupon: AdminCouponDetail): CouponForm {
  return {
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: String(coupon.discountValue),
    minOrder: coupon.minOrder ? String(coupon.minOrder / 100) : '',
    maxDiscount: coupon.maxDiscount ? String(coupon.maxDiscount / 100) : '',
    startsAt: toDateTimeInput(coupon.startsAt),
    endsAt: toDateTimeInput(coupon.endsAt),
    usageLimit: coupon.usageLimit ? String(coupon.usageLimit) : '',
    perUserLimit: String(coupon.perUserLimit),
    isActive: coupon.isActive,
    appliesTo: coupon.appliesTo,
    productIds: coupon.productIds,
    categoryIds: coupon.categoryIds,
  };
}

function CouponEditor({ couponId, onClose }: { couponId: string | null; onClose: () => void }) {
  const { data, isLoading } = useAdminCoupon(couponId ?? '');
  const categories = useAdminCategories();
  const [productQuery, setProductQuery] = useState('');
  const products = useAdminProducts({ q: productQuery || undefined, status: 'active', pageSize: 20 });
  const [form, setForm] = useState<CouponForm>(emptyCouponForm);
  const [hydrated, setHydrated] = useState(!couponId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();

  useEffect(() => {
    if (!data?.coupon || hydrated) return;
    setForm(couponDetailToForm(data.coupon));
    setHydrated(true);
  }, [data, hydrated]);

  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const selectedProductNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of data?.coupon?.products ?? []) map.set(product.id, product.name);
    for (const product of products.data?.products ?? []) map.set(product.id, product.name);
    return map;
  }, [data, products.data]);

  const toggleProduct = (id: string) => {
    set(
      'productIds',
      form.productIds.includes(id)
        ? form.productIds.filter((entry) => entry !== id)
        : [...form.productIds, id],
    );
  };

  const toggleCategory = (id: string) => {
    set(
      'categoryIds',
      form.categoryIds.includes(id)
        ? form.categoryIds.filter((entry) => entry !== id)
        : [...form.categoryIds, id],
    );
  };

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{3,40}$/.test(form.code.trim())) {
      nextErrors.code = 'Use 3–40 letters, numbers, hyphens or underscores.';
    }
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) nextErrors.discountValue = 'Enter a discount value.';
    if (form.discountType === 'percentage' && value > 100) {
      nextErrors.discountValue = 'A percentage cannot exceed 100.';
    }
    if (form.appliesTo === 'products' && !form.productIds.length) {
      nextErrors.productIds = 'Choose at least one product.';
    }
    if (form.appliesTo === 'categories' && !form.categoryIds.length) {
      nextErrors.categoryIds = 'Choose at least one category.';
    }
    if (form.startsAt && form.endsAt && new Date(form.startsAt) >= new Date(form.endsAt)) {
      nextErrors.endsAt = 'The end must be after the start.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = {
      code: form.code.trim(),
      description: form.description.trim(),
      discountType: form.discountType,
      discountValue: value,
      minOrder: form.minOrder ? Number(form.minOrder) : 0,
      maxDiscount: form.maxDiscount ? Number(form.maxDiscount) : null,
      startsAt: fromDateTimeInput(form.startsAt),
      endsAt: fromDateTimeInput(form.endsAt),
      usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
      perUserLimit: form.perUserLimit ? Number(form.perUserLimit) : 1,
      isActive: form.isActive,
      appliesTo: form.appliesTo,
      productIds: form.appliesTo === 'products' ? form.productIds : [],
      categoryIds: form.appliesTo === 'categories' ? form.categoryIds : [],
    };

    setSaving(true);
    setError(null);
    try {
      if (couponId) await api.patch(`/admin/coupons/${couponId}`, payload);
      else await api.post('/admin/coupons', payload);
      toast(couponId ? 'Discount code updated' : 'Discount code created');
      void invalidate();
      onClose();
    } catch (mutationError) {
      const fields = fieldErrors(mutationError);
      if (fields) setErrors(fields);
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={couponId ? 'Edit discount code' : 'New discount code'} size="lg">
      {couponId && isLoading && !hydrated ? (
        <AdminLoading label="Loading the discount code…" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" error={errors.code} hint="Customers enter this at checkout. Stored uppercase.">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  value={form.code}
                  onChange={(event) => set('code', event.target.value.toUpperCase())}
                  placeholder="WELCOME10"
                  invalid={Boolean(errors.code)}
                  autoFocus
                />
              )}
            </Field>
            <Field label="Status">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.isActive ? 'active' : 'inactive'}
                  onChange={(event) => set('isActive', event.target.value === 'active')}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              )}
            </Field>
          </div>

          <Field label="Description">
            {({ id }) => (
              <Input
                id={id}
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                placeholder="10% off your first order"
                maxLength={300}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Discount type">
              {({ id }) => (
                <Select
                  id={id}
                  value={form.discountType}
                  onChange={(event) => set('discountType', event.target.value as CouponForm['discountType'])}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed amount (ETB)</option>
                </Select>
              )}
            </Field>
            <Field
              label={form.discountType === 'percentage' ? 'Percentage off' : 'Amount off (ETB)'}
              error={errors.discountValue}
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="number"
                  min={form.discountType === 'percentage' ? 1 : 0.01}
                  max={form.discountType === 'percentage' ? 100 : undefined}
                  step="0.01"
                  value={form.discountValue}
                  onChange={(event) => set('discountValue', event.target.value)}
                  invalid={Boolean(errors.discountValue)}
                />
              )}
            </Field>
            <Field label="Max discount (ETB)" hint="Optional cap for percentage codes.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.maxDiscount}
                  onChange={(event) => set('maxDiscount', event.target.value)}
                  placeholder="No cap"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Minimum order (ETB)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.minOrder}
                  onChange={(event) => set('minOrder', event.target.value)}
                  placeholder="0"
                />
              )}
            </Field>
            <Field label="Total usage limit" hint="Leave blank for unlimited.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  step="1"
                  value={form.usageLimit}
                  onChange={(event) => set('usageLimit', event.target.value)}
                  placeholder="Unlimited"
                />
              )}
            </Field>
            <Field label="Uses per customer">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={1}
                  max={100}
                  step="1"
                  value={form.perUserLimit}
                  onChange={(event) => set('perUserLimit', event.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" hint="Addis Ababa time (UTC+3).">
              {({ id }) => (
                <Input
                  id={id}
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => set('startsAt', event.target.value)}
                />
              )}
            </Field>
            <Field label="Ends" error={errors.endsAt} hint="Addis Ababa time (UTC+3).">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => set('endsAt', event.target.value)}
                  invalid={Boolean(errors.endsAt)}
                />
              )}
            </Field>
          </div>

          <div>
            <label className="label" htmlFor="coupon-applies-to">
              Applies to
            </label>
            <Select
              id="coupon-applies-to"
              value={form.appliesTo}
              onChange={(event) => set('appliesTo', event.target.value as CouponForm['appliesTo'])}
            >
              <option value="all">The whole order</option>
              <option value="products">Specific products</option>
              <option value="categories">Specific categories</option>
            </Select>
          </div>

          {form.appliesTo === 'products' && (
            <div className="rounded-xl border border-line bg-cream/40 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-brand-900">Selected products</p>
                <span className="text-xs text-slate-warm">{form.productIds.length} chosen</span>
              </div>
              {form.productIds.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {form.productIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleProduct(id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-900/15 bg-white px-2.5 py-1 text-[11.5px] font-medium text-brand-900"
                    >
                      {selectedProductNames.get(id) ?? id.slice(0, 8)}
                      <span aria-hidden>×</span>
                    </button>
                  ))}
                </div>
              )}
              <SearchField
                value={productQuery}
                onChange={setProductQuery}
                placeholder="Search products to add…"
                className="mb-2 w-full sm:w-80"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {products.isLoading ? (
                  <p className="py-3 text-xs text-slate-warm">Loading products…</p>
                ) : !products.data?.products.length ? (
                  <p className="py-3 text-xs text-slate-warm">No matching products.</p>
                ) : (
                  products.data.products.map((product) => {
                    const checked = form.productIds.includes(product.id);
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => toggleProduct(product.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition hover:bg-white"
                      >
                        <span
                          className={
                            checked
                              ? 'grid size-4 place-items-center rounded border border-brand-900 bg-brand-900 text-[10px] text-white'
                              : 'size-4 rounded border border-line bg-white'
                          }
                          aria-hidden
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-brand-900">{product.name}</span>
                        <span className="text-[11px] text-slate-warm">{product.sku}</span>
                      </button>
                    );
                  })
                )}
              </div>
              {errors.productIds && <p className="mt-2 text-xs font-medium text-red-600">{errors.productIds}</p>}
            </div>
          )}

          {form.appliesTo === 'categories' && (
            <div className="rounded-xl border border-line bg-cream/40 p-4">
              <p className="mb-3 text-sm font-semibold text-brand-900">Categories</p>
              <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
                {(categories.data?.categories ?? []).map((category) => {
                  const checked = form.categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition hover:bg-white"
                    >
                      <span
                        className={
                          checked
                            ? 'grid size-4 place-items-center rounded border border-brand-900 bg-brand-900 text-[10px] text-white'
                            : 'size-4 rounded border border-line bg-white'
                        }
                        aria-hidden
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span className="truncate text-brand-900">{category.name}</span>
                    </button>
                  );
                })}
              </div>
              {errors.categoryIds && <p className="mt-2 text-xs font-medium text-red-600">{errors.categoryIds}</p>}
            </div>
          )}

          {error && <ErrorNotice message={error} />}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} loading={saving}>
              {couponId ? 'Save changes' : 'Create code'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------------- Banners */

interface BannerForm {
  title: string;
  subtitle: string;
  eyebrow: string;
  imageUrl: string;
  linkUrl: string;
  linkLabel: string;
  placement: 'hero' | 'promo' | 'category';
  theme: 'navy' | 'light' | 'gold';
  position: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

const emptyBannerForm: BannerForm = {
  title: '',
  subtitle: '',
  eyebrow: '',
  imageUrl: '',
  linkUrl: '',
  linkLabel: 'Shop now',
  placement: 'hero',
  theme: 'navy',
  position: '0',
  isActive: true,
  startsAt: '',
  endsAt: '',
};

function BannersTab({ canWrite }: { canWrite: boolean }) {
  const { data, isLoading, isError, error, refetch } = useAdminBanners();
  const [editor, setEditor] = useState<{ open: boolean; bannerId: string | null }>({
    open: false,
    bannerId: null,
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const invalidate = useAdminInvalidate();

  const editing = data?.banners.find((banner) => banner.id === editor.bannerId) ?? null;

  async function remove() {
    if (!deleting) return;
    try {
      await api.delete(`/admin/banners/${deleting}`);
      toast('Banner deleted');
      setDeleting(null);
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-warm">
          Banners power the storefront hero and promotional placements. Inactive or scheduled banners are hidden.
        </p>
        <Button
          iconLeft={<Plus className="size-4" />}
          onClick={() => setEditor({ open: true, bannerId: null })}
          disabled={!canWrite}
        >
          New banner
        </Button>
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading banners…" />
      ) : !data.banners.length ? (
        <div className="surface">
          <EmptyState
            icon={<Tag className="size-6" />}
            title="No banners configured"
            description="The storefront will use its built-in hero treatment until a banner is published."
            action={
              canWrite ? (
                <Button iconLeft={<Plus className="size-4" />} onClick={() => setEditor({ open: true, bannerId: null })}>
                  New banner
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.banners.map((banner) => (
            <Panel
              key={banner.id}
              title={
                <span className="flex items-center gap-2">
                  {banner.title}
                  <StatusBadge status={banner.isActive ? 'active' : 'inactive'} />
                </span>
              }
              description={`${humanize(banner.placement)}${banner.eyebrow ? ` · ${banner.eyebrow}` : ''}`}
              action={
                canWrite ? (
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      iconLeft={<PencilLine className="size-3.5" />}
                      onClick={() => setEditor({ open: true, bannerId: banner.id })}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setDeleting(banner.id)}
                      aria-label={`Delete ${banner.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : undefined
              }
              bodyClassName="p-0"
            >
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="h-32 w-full shrink-0 overflow-hidden bg-brand-950 sm:w-44">
                  {banner.imageUrl ? (
                    <img src={banner.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-[11px] font-semibold uppercase tracking-widest text-white/60">
                      {banner.theme} theme
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1 pb-4 pr-4 sm:py-4 sm:pl-0">
                  {banner.subtitle && <p className="text-[12.5px] text-slate-warm">{banner.subtitle}</p>}
                  <p className="text-[11.5px] text-slate-warm">
                    Link: {banner.linkUrl || '—'} · Button: {banner.linkLabel}
                  </p>
                  <p className="text-[11.5px] text-slate-warm">
                    Position {banner.position} ·{' '}
                    {banner.startsAt ? formatDateTime(banner.startsAt) : 'Always on'}
                    {banner.endsAt ? ` – ${formatDateTime(banner.endsAt)}` : ''}
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {editor.open && (
        <BannerEditor
          banner={editor.bannerId ? editing : null}
          onClose={() => setEditor({ open: false, bannerId: null })}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete banner"
        confirmLabel="Delete banner"
        destructive
        description="This removes the banner from the storefront immediately."
      />
    </div>
  );
}

function BannerEditor({
  banner,
  onClose,
}: {
  banner: { id: string; title: string; subtitle: string; eyebrow: string; imageUrl: string | null; linkUrl: string | null; linkLabel: string; placement: string; theme: string; position: number; isActive: boolean; startsAt: string | null; endsAt: string | null } | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<BannerForm>(() =>
    banner
      ? {
          title: banner.title,
          subtitle: banner.subtitle,
          eyebrow: banner.eyebrow,
          imageUrl: banner.imageUrl ?? '',
          linkUrl: banner.linkUrl ?? '',
          linkLabel: banner.linkLabel,
          placement: banner.placement as BannerForm['placement'],
          theme: banner.theme as BannerForm['theme'],
          position: String(banner.position),
          isActive: banner.isActive,
          startsAt: toDateTimeInput(banner.startsAt),
          endsAt: toDateTimeInput(banner.endsAt),
        }
      : emptyBannerForm,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();

  const set = <K extends keyof BannerForm>(key: K, value: BannerForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (form.title.trim().length < 2) nextErrors.title = 'Give the banner a title.';
    if (form.linkUrl && !form.linkUrl.startsWith('/') && !form.linkUrl.startsWith('https://')) {
      nextErrors.linkUrl = 'Use a store path starting with / or an https:// URL.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      eyebrow: form.eyebrow.trim(),
      imageUrl: form.imageUrl.trim() || null,
      linkUrl: form.linkUrl.trim() || null,
      linkLabel: form.linkLabel.trim() || 'Shop now',
      placement: form.placement,
      theme: form.theme,
      position: form.position ? Number(form.position) : 0,
      isActive: form.isActive,
      startsAt: fromDateTimeInput(form.startsAt),
      endsAt: fromDateTimeInput(form.endsAt),
    };

    setSaving(true);
    setError(null);
    try {
      if (banner) await api.patch(`/admin/banners/${banner.id}`, payload);
      else await api.post('/admin/banners', payload);
      toast(banner ? 'Banner updated' : 'Banner created');
      void invalidate();
      onClose();
    } catch (mutationError) {
      const fields = fieldErrors(mutationError);
      if (fields) setErrors(fields);
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={banner ? 'Edit banner' : 'New banner'} size="lg">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={errors.title}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="Timeless pieces for every table"
                invalid={Boolean(errors.title)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Eyebrow">
            {({ id }) => (
              <Input
                id={id}
                value={form.eyebrow}
                onChange={(event) => set('eyebrow', event.target.value)}
                placeholder="New season"
              />
            )}
          </Field>
        </div>

        <Field label="Subtitle">
          {({ id }) => (
            <Textarea
              id={id}
              value={form.subtitle}
              onChange={(event) => set('subtitle', event.target.value)}
              rows={2}
              placeholder="Thoughtfully sourced homeware, delivered across Ethiopia."
            />
          )}
        </Field>

        <ImageUploadField value={form.imageUrl} onChange={(url) => set('imageUrl', url)} label="Background image" />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Placement">
            {({ id }) => (
              <Select
                id={id}
                value={form.placement}
                onChange={(event) => set('placement', event.target.value as BannerForm['placement'])}
              >
                <option value="hero">Hero</option>
                <option value="promo">Promo strip</option>
                <option value="category">Category</option>
              </Select>
            )}
          </Field>
          <Field label="Theme">
            {({ id }) => (
              <Select
                id={id}
                value={form.theme}
                onChange={(event) => set('theme', event.target.value as BannerForm['theme'])}
              >
                <option value="navy">Navy</option>
                <option value="light">Light</option>
                <option value="gold">Gold</option>
              </Select>
            )}
          </Field>
          <Field label="Position" hint="Lower numbers appear first.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                max={999}
                value={form.position}
                onChange={(event) => set('position', event.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Link URL" error={errors.linkUrl} hint="Store path (/) or an https:// URL.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={form.linkUrl}
                onChange={(event) => set('linkUrl', event.target.value)}
                placeholder="/collections/home"
                invalid={Boolean(errors.linkUrl)}
              />
            )}
          </Field>
          <Field label="Button label">
            {({ id }) => (
              <Input
                id={id}
                value={form.linkLabel}
                onChange={(event) => set('linkLabel', event.target.value)}
                placeholder="Shop now"
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Starts" hint="Addis Ababa time (UTC+3).">
            {({ id }) => (
              <Input
                id={id}
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => set('startsAt', event.target.value)}
              />
            )}
          </Field>
          <Field label="Ends">
            {({ id }) => (
              <Input
                id={id}
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => set('endsAt', event.target.value)}
              />
            )}
          </Field>
          <Field label="Visibility">
            {({ id }) => (
              <Select
                id={id}
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(event) => set('isActive', event.target.value === 'active')}
              >
                <option value="active">Active</option>
                <option value="inactive">Hidden</option>
              </Select>
            )}
          </Field>
        </div>

        {error && <ErrorNotice message={error} />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {banner ? 'Save changes' : 'Create banner'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------- Newsletter */

function NewsletterTab({ canWrite }: { canWrite: boolean }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('nq') ?? '';
  const status = params.get('nstatus') ?? 'all';
  const page = Math.max(1, Number(params.get('npage') || '1') || 1);
  const [search, setSearch] = useState(q);
  const invalidate = useAdminInvalidate();

  useEffect(() => setSearch(q), [q]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    if (!('npage' in next)) merged.delete('npage');
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === q) return;
      update({ nq: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = useMemo(() => ({ q: q || undefined, status, page, pageSize: 25 }), [q, status, page]);
  const { data, isLoading, isError, error, refetch } = useAdminSubscribers(query);

  async function toggle(id: string, nextStatus: string) {
    try {
      await api.patch(`/admin/newsletter/subscribers/${id}`, {
        status: nextStatus === 'subscribed' ? 'unsubscribed' : 'subscribed',
      });
      toast('Subscriber updated');
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Email address" className="w-full sm:w-72" />
        <SelectField
          label="Status"
          value={status}
          onChange={(next) => update({ nstatus: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All subscribers' },
            { value: 'subscribed', label: 'Subscribed' },
            { value: 'unsubscribed', label: 'Unsubscribed' },
          ]}
        />
        <a
          href={adminCsvUrl('newsletter/subscribers/export', { q, status })}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-3.5 text-[13px] font-semibold text-brand-900 transition hover:border-brand-900/30"
        >
          <Download className="size-4 text-gold-700" /> Export CSV
        </a>
        <span className="ml-auto text-xs text-slate-warm">
          {data ? `${data.counts.subscribed ?? 0} subscribed · ${data.counts.unsubscribed ?? 0} unsubscribed` : ' '}
        </span>
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading subscribers…" />
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[760px]">
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th>Subscribed</Th>
                <Th>Confirmed</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.subscribers.length === 0 ? (
                <TableEmpty colSpan={6}>No subscribers match this view.</TableEmpty>
              ) : (
                data.subscribers.map((subscriber) => (
                  <tr key={subscriber.id} className="transition hover:bg-cream/50">
                    <Td className="font-medium text-brand-900">{subscriber.email}</Td>
                    <Td>
                      <StatusBadge status={subscriber.status} />
                    </Td>
                    <Td className="text-[12px] capitalize text-slate-warm">{subscriber.source}</Td>
                    <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                      {formatDateTime(subscriber.createdAt)}
                    </Td>
                    <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                      {subscriber.confirmedAt ? formatDateTime(subscriber.confirmedAt) : '—'}
                    </Td>
                    <Td align="right">
                      {canWrite ? (
                        <Button variant="ghost" size="sm" onClick={() => void toggle(subscriber.id, subscriber.status)}>
                          {subscriber.status === 'subscribed' ? 'Unsubscribe' : 'Resubscribe'}
                        </Button>
                      ) : (
                        <span className="text-[11.5px] text-slate-warm">Read only</span>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(next) => update({ npage: String(next) })}
          />
        </div>
      )}

      {!isLoading && data && !data.subscribers.length && !q && status === 'all' && (
        <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-warm">
          <Mail className="size-3.5" /> New signups from the storefront footer appear here.
        </p>
      )}
    </div>
  );
}
