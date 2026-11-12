import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Boxes, ClipboardList, PackageSearch, Plus, Truck } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  AdminTabs,
  ConfirmDialog,
  DataTable,
  DateRangeFields,
  ErrorNotice,
  Panel,
  SearchField,
  SelectField,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/ui';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import {
  rangeDays,
  useAdminCategories,
  useAdminInvalidate,
  useAdminInventory,
  useAdminMovements,
  useAdminProducts,
  useAdminSupplier,
  useAdminSuppliers,
  type AdminInventoryVariant,
  type AdminSupplier,
} from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatSantim } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

type Tab = 'stock' | 'movements' | 'suppliers';

const REASONS = ['all', 'restock', 'sale', 'reservation', 'release', 'adjustment', 'return', 'damage', 'import'];

interface SupplierDraft {
  id?: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isActive: boolean;
}

interface SupplierProductDraft {
  productId: string;
  costPrice: string;
  leadTimeDays: string;
  minOrderQty: string;
}

const emptySupplier = (): SupplierDraft => ({
  name: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
  isActive: true,
});

export default function AdminInventoryPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const requested = params.get('tab');
    return requested === 'movements' || requested === 'suppliers' ? requested : 'stock';
  });
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const canWrite = permissions.includes('inventory.write');
  const canSuppliers = permissions.includes('suppliers.write');
  const invalidate = useAdminInvalidate();

  const [adjustFor, setAdjustFor] = useState<AdminInventoryVariant | null>(null);
  const [adjust, setAdjust] = useState({ delta: '', reason: 'restock', note: '' });
  const [thresholdFor, setThresholdFor] = useState<AdminInventoryVariant | null>(null);
  const [threshold, setThreshold] = useState('');
  const [supplierDraft, setSupplierDraft] = useState<SupplierDraft | null>(null);
  const [supplierProductsFor, setSupplierProductsFor] = useState<string | null>(null);
  const [supplierRemoval, setSupplierRemoval] = useState<AdminSupplier | null>(null);

  function selectTab(next: Tab) {
    setTab(next);
    const merged = new URLSearchParams(params);
    if (next === 'stock') merged.delete('tab');
    else merged.set('tab', next);
    setParams(merged, { replace: true });
  }

  const adjustMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/inventory/adjust', {
        variantId: adjustFor?.variantId,
        delta: Number(adjust.delta),
        reason: adjust.reason,
        note: adjust.note.trim() || undefined,
      }),
    onSuccess: () => {
      toast('Stock adjusted');
      setAdjustFor(null);
      setAdjust({ delta: '', reason: 'restock', note: '' });
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const thresholdMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/inventory/${thresholdFor?.variantId}`, {
        lowStockThreshold: Number(threshold || 0),
      }),
    onSuccess: () => {
      toast('Low-stock threshold updated');
      setThresholdFor(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const saveSupplier = useMutation({
    mutationFn: (draft: SupplierDraft) => {
      const payload = {
        name: draft.name.trim(),
        contactName: draft.contactName.trim(),
        email: draft.email.trim(),
        phone: draft.phone.trim(),
        address: draft.address.trim(),
        notes: draft.notes.trim(),
        isActive: draft.isActive,
      };
      if (draft.id) return api.patch(`/admin/suppliers/${draft.id}`, payload);
      return api.post('/admin/suppliers', payload);
    },
    onSuccess: () => {
      toast(supplierDraft?.id ? 'Supplier updated' : 'Supplier created');
      setSupplierDraft(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const removeSupplier = useMutation({
    mutationFn: (supplier: AdminSupplier) => api.delete(`/admin/suppliers/${supplier.id}`),
    onSuccess: () => {
      toast('Supplier deleted');
      setSupplierRemoval(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <div>
      <AdminPageHeader
        title="Inventory"
        description="Stock levels, movement history and supplier relationships. Every adjustment is recorded against your account."
        eyebrow="Commerce"
      />

      <AdminTabs
        className="mb-5"
        value={tab}
        onChange={selectTab}
        tabs={[
          { key: 'stock', label: 'Stock' },
          { key: 'movements', label: 'Movements' },
          { key: 'suppliers', label: 'Suppliers' },
        ]}
      />

      {tab === 'stock' && (
        <StockTab
          canWrite={canWrite}
          onAdjust={(variant) => {
            setAdjustFor(variant);
            setAdjust({ delta: '', reason: 'restock', note: '' });
          }}
          onThreshold={(variant) => {
            setThresholdFor(variant);
            setThreshold(String(variant.lowStockThreshold));
          }}
        />
      )}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'suppliers' && (
        <SuppliersTab
          canWrite={canSuppliers}
          onCreate={() => setSupplierDraft(emptySupplier())}
          onEdit={(supplier) =>
            setSupplierDraft({
              id: supplier.id,
              name: supplier.name,
              contactName: supplier.contactName ?? '',
              email: supplier.email ?? '',
              phone: supplier.phone ?? '',
              address: supplier.address ?? '',
              notes: supplier.notes ?? '',
              isActive: supplier.isActive,
            })
          }
          onProducts={(supplier) => setSupplierProductsFor(supplier.id)}
          onDelete={(supplier) => setSupplierRemoval(supplier)}
        />
      )}

      <Modal open={Boolean(adjustFor)} onClose={() => setAdjustFor(null)} title="Adjust stock" size="sm">
        {adjustFor && (
          <div className="space-y-4">
            <div className="rounded-xl bg-cream px-3 py-2.5 text-[12.5px]">
              <p className="font-semibold text-brand-900">{adjustFor.productName}</p>
              <p className="text-slate-warm">
                {adjustFor.sku} · on hand {adjustFor.quantity} · reserved {adjustFor.reserved} · available{' '}
                {adjustFor.available}
              </p>
            </div>
            <Field label="Change" hint="Use a negative number to remove stock, e.g. -2 for damaged units.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  step="1"
                  value={adjust.delta}
                  onChange={(event) => setAdjust({ ...adjust, delta: event.target.value })}
                  placeholder="e.g. 10 or -2"
                />
              )}
            </Field>
            <Field label="Reason">
              {({ id }) => (
                <Select
                  id={id}
                  value={adjust.reason}
                  onChange={(event) => setAdjust({ ...adjust, reason: event.target.value })}
                >
                  <option value="restock">Restock</option>
                  <option value="adjustment">Stock count adjustment</option>
                  <option value="return">Customer return</option>
                  <option value="damage">Damage / write-off</option>
                </Select>
              )}
            </Field>
            <Field label="Note">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={adjust.note}
                  onChange={(event) => setAdjust({ ...adjust, note: event.target.value })}
                  maxLength={300}
                  placeholder="What prompted this adjustment?"
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAdjustFor(null)}>
                Cancel
              </Button>
              <Button
                loading={adjustMutation.isPending}
                disabled={!adjust.delta || Number(adjust.delta) === 0}
                onClick={() => adjustMutation.mutate()}
              >
                Apply adjustment
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(thresholdFor)}
        onClose={() => setThresholdFor(null)}
        title="Low-stock threshold"
        size="sm"
      >
        {thresholdFor && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-slate-warm">
              Alert the team when available stock for <strong>{thresholdFor.productName}</strong> falls to this level or
              below.
            </p>
            <Field label="Threshold (units)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min="0"
                  step="1"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setThresholdFor(null)}>
                Cancel
              </Button>
              <Button loading={thresholdMutation.isPending} onClick={() => thresholdMutation.mutate()}>
                Save threshold
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(supplierDraft)}
        onClose={() => setSupplierDraft(null)}
        title={supplierDraft?.id ? 'Edit supplier' : 'New supplier'}
      >
        {supplierDraft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier name">
                {({ id }) => (
                  <Input
                    id={id}
                    value={supplierDraft.name}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, name: event.target.value })}
                    maxLength={160}
                  />
                )}
              </Field>
              <Field label="Contact person">
                {({ id }) => (
                  <Input
                    id={id}
                    value={supplierDraft.contactName}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, contactName: event.target.value })}
                    maxLength={120}
                  />
                )}
              </Field>
              <Field label="Email">
                {({ id }) => (
                  <Input
                    id={id}
                    type="email"
                    value={supplierDraft.email}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, email: event.target.value })}
                    maxLength={180}
                  />
                )}
              </Field>
              <Field label="Phone">
                {({ id }) => (
                  <Input
                    id={id}
                    value={supplierDraft.phone}
                    onChange={(event) => setSupplierDraft({ ...supplierDraft, phone: event.target.value })}
                    maxLength={40}
                  />
                )}
              </Field>
            </div>
            <Field label="Address">
              {({ id }) => (
                <Input
                  id={id}
                  value={supplierDraft.address}
                  onChange={(event) => setSupplierDraft({ ...supplierDraft, address: event.target.value })}
                  maxLength={500}
                />
              )}
            </Field>
            <Field label="Notes">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={supplierDraft.notes}
                  onChange={(event) => setSupplierDraft({ ...supplierDraft, notes: event.target.value })}
                  maxLength={1000}
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-900">
              <input
                type="checkbox"
                className="size-4 accent-brand-900"
                checked={supplierDraft.isActive}
                onChange={(event) => setSupplierDraft({ ...supplierDraft, isActive: event.target.checked })}
              />
              Active supplier
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSupplierDraft(null)}>
                Cancel
              </Button>
              <Button
                loading={saveSupplier.isPending}
                disabled={!supplierDraft.name.trim()}
                onClick={() => saveSupplier.mutate(supplierDraft)}
              >
                {supplierDraft.id ? 'Save supplier' : 'Create supplier'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <SupplierProductsModal
        supplierId={supplierProductsFor}
        onClose={() => setSupplierProductsFor(null)}
      />

      <ConfirmDialog
        open={Boolean(supplierRemoval)}
        onClose={() => setSupplierRemoval(null)}
        onConfirm={() => supplierRemoval && removeSupplier.mutate(supplierRemoval)}
        loading={removeSupplier.isPending}
        title="Delete supplier"
        confirmLabel="Delete supplier"
        destructive
        description={
          <>
            Delete <strong>{supplierRemoval?.name}</strong>? Their product links will be removed. This does not affect
            product stock or cost records.
          </>
        }
      />
    </div>
  );
}

function StockTab({
  canWrite,
  onAdjust,
  onThreshold,
}: {
  canWrite: boolean;
  onAdjust: (variant: AdminInventoryVariant) => void;
  onThreshold: (variant: AdminInventoryVariant) => void;
}) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const state = params.get('state') ?? 'all';
  const categoryId = params.get('categoryId') ?? '';
  const page = Math.max(1, Number(params.get('page') || '1') || 1);
  const [search, setSearch] = useState(q);
  const categories = useAdminCategories();

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
    () => ({ q: q || undefined, state, categoryId: categoryId || undefined, page, pageSize: 25 }),
    [q, state, categoryId, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminInventory(query);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Search product or SKU" className="w-full sm:w-72" />
        <SelectField
          label="Stock state"
          value={state}
          onChange={(next) => update({ state: next === 'all' ? null : next })}
          options={[
            { value: 'all', label: 'All stock' },
            { value: 'low', label: 'Low stock' },
            { value: 'out', label: 'Out of stock' },
            { value: 'reserved', label: 'Reserved' },
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
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading stock…" />
      ) : !data.variants.length ? (
        <div className="surface p-10 text-center text-sm text-slate-warm">
          <Boxes className="mx-auto mb-3 size-6" /> No variants match this view.
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[1000px]">
            <thead>
              <tr>
                <Th>Variant</Th>
                <Th>SKU</Th>
                <Th align="right">Price</Th>
                <Th align="right">On hand</Th>
                <Th align="right">Reserved</Th>
                <Th align="right">Available</Th>
                <Th align="right">Threshold</Th>
                <Th>State</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.variants.map((variant) => {
                const stateLabel = variant.available <= 0 ? 'out' : variant.available <= variant.lowStockThreshold ? 'low' : 'active';
                return (
                  <tr key={variant.variantId} className="transition hover:bg-cream/50">
                    <Td>
                      <p className="max-w-[280px] truncate text-[13px] font-semibold text-brand-900">
                        {variant.productName}
                      </p>
                      <p className="text-[11.5px] text-slate-warm">
                        {Object.values(variant.optionValues ?? {}).join(' / ') || 'Default'}
                      </p>
                    </Td>
                    <Td className="text-[12px] text-slate-warm">{variant.sku}</Td>
                    <Td align="right" className="whitespace-nowrap text-[12.5px]">
                      {formatSantim(variant.price)}
                      {variant.costPrice !== null && (
                        <span className="block text-[10.5px] text-slate-warm">Cost {formatSantim(variant.costPrice)}</span>
                      )}
                    </Td>
                    <Td align="right" className="font-semibold text-brand-900">
                      {variant.quantity}
                    </Td>
                    <Td align="right" className="text-slate-warm">
                      {variant.reserved}
                    </Td>
                    <Td align="right" className="font-semibold text-brand-900">
                      {variant.available}
                    </Td>
                    <Td align="right" className="text-[12.5px] text-slate-warm">
                      {variant.lowStockThreshold}
                    </Td>
                    <Td>
                      <StatusBadge status={stateLabel} />
                    </Td>
                    <Td align="right">
                      {canWrite ? (
                        <div className="inline-flex gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => onThreshold(variant)}>
                            Threshold
                          </Button>
                          <Button size="sm" onClick={() => onAdjust(variant)}>
                            Adjust
                          </Button>
                        </div>
                      ) : (
                        <span className="text-[11.5px] text-slate-warm">Read only</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <PaginationInline
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(next) => update({ page: String(next) })}
          />
        </div>
      )}
    </div>
  );
}

function MovementsTab() {
  const [params, setParams] = useSearchParams();
  const q = params.get('mq') ?? '';
  const reason = params.get('reason') ?? 'all';
  const page = Math.max(1, Number(params.get('mpage') || '1') || 1);
  const [search, setSearch] = useState(q);
  const [range, setRange] = useState(() => ({
    from: params.get('mfrom') ?? rangeDays(30).from,
    to: params.get('mto') ?? rangeDays(30).to,
  }));

  useEffect(() => setSearch(q), [q]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') merged.delete(key);
      else merged.set(key, value);
    }
    if (!('mpage' in next)) merged.delete('mpage');
    setParams(merged, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === q) return;
      update({ mq: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useAdminMovements({
    q: q || undefined,
    reason,
    from: range.from,
    to: range.to,
    page,
    pageSize: 30,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Product, SKU or note" className="w-full sm:w-64" />
        <SelectField
          label="Reason"
          value={reason}
          onChange={(next) => update({ reason: next === 'all' ? null : next })}
          options={REASONS.map((item) => ({
            value: item,
            label: item === 'all' ? 'All reasons' : item.charAt(0).toUpperCase() + item.slice(1),
          }))}
        />
        <DateRangeFields
          value={range}
          onChange={(next) => {
            setRange(next);
            update({ mfrom: next.from, mto: next.to });
          }}
        />
      </div>

      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading movements…" />
      ) : !data.movements.length ? (
        <div className="surface p-10 text-center text-sm text-slate-warm">
          <ClipboardList className="mx-auto mb-3 size-6" /> No stock movements in this view.
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[900px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Variant</Th>
                <Th align="right">Change</Th>
                <Th align="right">Balance</Th>
                <Th>Reason</Th>
                <Th>Note</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {data.movements.map((movement) => (
                <tr key={movement.id} className="transition hover:bg-cream/50">
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {formatDateTime(movement.createdAt)}
                  </Td>
                  <Td>
                    <p className="text-[13px] font-semibold text-brand-900">{movement.productName}</p>
                    <p className="text-[11.5px] text-slate-warm">{movement.sku}</p>
                  </Td>
                  <Td
                    align="right"
                    className={movement.delta >= 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}
                  >
                    {movement.delta > 0 ? '+' : ''}
                    {movement.delta}
                  </Td>
                  <Td align="right" className="text-brand-900">
                    {movement.balanceAfter}
                  </Td>
                  <Td>
                    <StatusBadge status={movement.reason} />
                  </Td>
                  <Td className="max-w-[260px] text-[12px] text-slate-warm">
                    {movement.note ?? '—'}
                    {movement.referenceType && (
                      <span className="block text-[10.5px] uppercase tracking-wide text-slate-warm/70">
                        {movement.referenceType}
                      </span>
                    )}
                  </Td>
                  <Td className="text-[12px] text-slate-warm">{movement.actor ?? 'System'}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <PaginationInline
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onChange={(next) => update({ mpage: String(next) })}
          />
        </div>
      )}
    </div>
  );
}

function SuppliersTab({
  canWrite,
  onCreate,
  onEdit,
  onProducts,
  onDelete,
}: {
  canWrite: boolean;
  onCreate: () => void;
  onEdit: (supplier: AdminSupplier) => void;
  onProducts: (supplier: AdminSupplier) => void;
  onDelete: (supplier: AdminSupplier) => void;
}) {
  const { data, isLoading, isError, error, refetch } = useAdminSuppliers();

  return (
    <div>
      <div className="mb-4 flex justify-end">
        {canWrite && (
          <Button size="sm" onClick={onCreate} iconLeft={<Plus className="size-4" />}>
            New supplier
          </Button>
        )}
      </div>
      {isError ? (
        <div className="space-y-3">
          <ErrorNotice message={errorMessage(error)} />
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isLoading || !data ? (
        <AdminLoading label="Loading suppliers…" />
      ) : !data.suppliers.length ? (
        <div className="surface p-10 text-center text-sm text-slate-warm">
          <Truck className="mx-auto mb-3 size-6" /> No suppliers have been added yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.suppliers.map((supplier) => (
            <Panel key={supplier.id} className="h-full">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-[15px] font-bold text-brand-900">{supplier.name}</h3>
                  {supplier.contactName && <p className="text-[12px] text-slate-warm">{supplier.contactName}</p>}
                </div>
                <StatusBadge status={supplier.isActive ? 'active' : 'inactive'} />
              </div>
              <div className="mt-3 space-y-1 text-[12.5px] text-slate-warm">
                {supplier.email && <p>{supplier.email}</p>}
                {supplier.phone && <p>{supplier.phone}</p>}
                {supplier.address && <p className="line-clamp-2">{supplier.address}</p>}
                <p className="font-semibold text-brand-900">{supplier.productCount} linked products</p>
              </div>
              {canWrite && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => onEdit(supplier)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onProducts(supplier)}>
                    Products
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => onDelete(supplier)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

function SupplierProductsModal({ supplierId, onClose }: { supplierId: string | null; onClose: () => void }) {
  const supplier = useAdminSupplier(supplierId ?? '');
  const products = useAdminProducts({ pageSize: 100, status: 'active' });
  const invalidate = useAdminInvalidate();
  const [rows, setRows] = useState<SupplierProductDraft[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');

  useEffect(() => {
    if (supplier.data?.supplier) {
      setRows(
        supplier.data.supplier.products.map((entry) => ({
          productId: entry.productId,
          costPrice: entry.costPrice === null ? '' : (entry.costPrice / 100).toFixed(2),
          leadTimeDays: entry.leadTimeDays === null ? '' : String(entry.leadTimeDays),
          minOrderQty: entry.minOrderQty === null ? '' : String(entry.minOrderQty),
        })),
      );
    }
  }, [supplier.data]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/admin/suppliers/${supplierId}/products`, {
        products: rows.map((row) => ({
          productId: row.productId,
          costPrice: row.costPrice ? Math.round(Number(row.costPrice) * 100) : null,
          leadTimeDays: row.leadTimeDays ? Number(row.leadTimeDays) : null,
          minOrderQty: row.minOrderQty ? Number(row.minOrderQty) : null,
        })),
      }),
    onSuccess: () => {
      toast('Supplier products saved');
      void invalidate();
      onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const available = (products.data?.products ?? []).filter(
    (product) => !rows.some((row) => row.productId === product.id),
  );

  return (
    <Modal open={Boolean(supplierId)} onClose={onClose} title="Supplier products" size="lg">
      {supplier.isLoading ? (
        <AdminLoading label="Loading supplier…" />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1">
              <Field label="Add a product">
                {({ id }) => (
                  <Select
                    id={id}
                    value={selectedProduct}
                    onChange={(event) => setSelectedProduct(event.target.value)}
                  >
                    <option value="">Choose a product…</option>
                    {available.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Button
              variant="outline"
              iconLeft={<Plus className="size-4" />}
              disabled={!selectedProduct}
              onClick={() => {
                setRows([...rows, { productId: selectedProduct, costPrice: '', leadTimeDays: '', minOrderQty: '' }]);
                setSelectedProduct('');
              }}
            >
              Add
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl bg-cream px-4 py-6 text-[12.5px] text-slate-warm">
              <PackageSearch className="size-4" /> No products are linked to this supplier.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const product = products.data?.products.find((entry) => entry.id === row.productId);
                return (
                  <div key={row.productId} className="rounded-xl border border-line/70 bg-cream/40 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-brand-900">
                        {product?.name ?? `Product ${row.productId.slice(0, 8)}`}
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => setRows(rows.filter((_entry, position) => position !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Cost (ETB)">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.costPrice}
                            onChange={(event) =>
                              setRows(
                                rows.map((entry, position) =>
                                  position === index ? { ...entry, costPrice: event.target.value } : entry,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                      <Field label="Lead time (days)">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="number"
                            min="0"
                            step="1"
                            value={row.leadTimeDays}
                            onChange={(event) =>
                              setRows(
                                rows.map((entry, position) =>
                                  position === index ? { ...entry, leadTimeDays: event.target.value } : entry,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                      <Field label="Min order qty">
                        {({ id }) => (
                          <Input
                            id={id}
                            type="number"
                            min="1"
                            step="1"
                            value={row.minOrderQty}
                            onChange={(event) =>
                              setRows(
                                rows.map((entry, position) =>
                                  position === index ? { ...entry, minOrderQty: event.target.value } : entry,
                                ),
                              )
                            }
                          />
                        )}
                      </Field>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save products
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PaginationInline({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-[12px] text-slate-warm">
      <span>
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
