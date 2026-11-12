import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Archive, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  ConfirmDialog,
  ErrorNotice,
  ImageUploadField,
  Panel,
  StatusBadge,
} from '@/components/admin/ui';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import {
  useAdminBrands,
  useAdminCategories,
  useAdminInvalidate,
  useAdminProduct,
  type AdminProduct,
} from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatSantim } from '@/lib/format';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

interface VariantDraft {
  key: string;
  id?: string;
  sku: string;
  barcode: string;
  price: string;
  compareAtPrice: string;
  optionValues: string;
  isActive: boolean;
  quantity: string;
  lowStockThreshold: string;
}

interface ImageDraft {
  id?: string;
  url: string;
  alt: string;
}

interface SpecDraft {
  label: string;
  value: string;
}

let variantKey = 0;
const nextKey = () => `variant-${++variantKey}`;

const emptyVariant = (): VariantDraft => ({
  key: nextKey(),
  sku: '',
  barcode: '',
  price: '',
  compareAtPrice: '',
  optionValues: 'Default=Standard',
  isActive: true,
  quantity: '0',
  lowStockThreshold: '5',
});

function etb(santim: number | null | undefined): string {
  if (santim === null || santim === undefined) return '';
  return (santim / 100).toFixed(2);
}

function toSantim(value: string): number {
  return Math.round(Number(value || '0') * 100);
}

function parseOptionValues(value: string): Record<string, string> {
  const entries: [string, string][] = [];
  for (const part of value.split(',')) {
    const [rawName, ...rest] = part.split(/[=:]/);
    const name = rawName?.trim();
    const optionValue = rest.join(':').trim();
    if (name && optionValue) entries.push([name, optionValue]);
  }
  return Object.fromEntries(entries);
}

function optionValuesText(values: Record<string, string> | undefined): string {
  return Object.entries(values ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Panel title={title} description={description}>
      {children}
    </Panel>
  );
}

export default function AdminProductEditorPage() {
  const { productId } = useParams();
  const editing = Boolean(productId);
  const navigate = useNavigate();
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const canWrite = permissions.includes('products.write');
  const canInventory = permissions.includes('inventory.write');
  const canCost = permissions.includes('inventory.cost');
  const canDelete = permissions.includes('products.delete');
  const invalidate = useAdminInvalidate();

  const product = useAdminProduct(productId ?? '');
  const categories = useAdminCategories();
  const brands = useAdminBrands();

  const [form, setForm] = useState({
    name: '',
    slug: '',
    sku: '',
    barcode: '',
    shortDescription: '',
    description: '',
    categoryId: '',
    brandId: '',
    basePrice: '',
    compareAtPrice: '',
    status: 'draft',
    isFeatured: false,
    warrantyInfo: '',
    returnInfo: '',
    lowStockThreshold: '5',
    metaTitle: '',
    metaDescription: '',
    costPrice: '',
  });
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [specs, setSpecs] = useState<SpecDraft[]>([]);
  const [hydrated, setHydrated] = useState(!editing);
  const [removeVariant, setRemoveVariant] = useState<{ key: string; id?: string; sku: string } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    const loaded = product.data?.product;
    if (!loaded || hydrated) return;
    hydrate(loaded);
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.data]);

  function hydrate(loaded: AdminProduct) {
    setForm({
      name: loaded.name,
      slug: loaded.slug,
      sku: loaded.sku,
      barcode: loaded.barcode ?? '',
      shortDescription: loaded.shortDescription,
      description: loaded.description,
      categoryId: loaded.categoryId ?? '',
      brandId: loaded.brandId ?? '',
      basePrice: etb(loaded.basePrice),
      compareAtPrice: etb(loaded.compareAtPrice),
      status: loaded.status === 'archived' ? 'draft' : loaded.status,
      isFeatured: loaded.isFeatured,
      warrantyInfo: loaded.warrantyInfo,
      returnInfo: loaded.returnInfo,
      lowStockThreshold: String(loaded.lowStockThreshold),
      metaTitle: loaded.metaTitle ?? '',
      metaDescription: loaded.metaDescription ?? '',
      costPrice: etb(loaded.costPrice),
    });
    setImages(loaded.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })));
    setVariants(
      loaded.variants.map((variant) => ({
        key: variant.id,
        id: variant.id,
        sku: variant.sku,
        barcode: variant.barcode ?? '',
        price: etb(variant.price),
        compareAtPrice: etb(variant.compareAtPrice),
        optionValues: optionValuesText(variant.optionValues) || 'Default=Standard',
        isActive: variant.isActive,
        quantity: String(variant.quantity),
        lowStockThreshold: String(variant.lowStockThreshold ?? 5),
      })),
    );
    setSpecs(loaded.specs ?? []);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.sku.trim()) throw new Error('Enter a product name and SKU.');
      if (!form.basePrice || toSantim(form.basePrice) < 0) throw new Error('Enter a valid base price.');
      if (!variants.length) throw new Error('Add at least one variant.');
      for (const variant of variants) {
        if (!variant.sku.trim()) throw new Error('Every variant needs a SKU.');
        if (!variant.price) throw new Error(`Enter a price for ${variant.sku || 'the variant'}.`);
      }
      const imagePayload = images.filter((image) => image.url.trim()).map((image) => ({
        url: image.url.trim(),
        alt: image.alt.trim(),
      }));
      const specsPayload = specs.filter((spec) => spec.label.trim() && spec.value.trim());

      const productPayload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        sku: form.sku.trim(),
        barcode: form.barcode.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        brandId: form.brandId || null,
        basePrice: toSantim(form.basePrice),
        compareAtPrice: form.compareAtPrice ? toSantim(form.compareAtPrice) : undefined,
        status: form.status,
        isFeatured: form.isFeatured,
        specs: specsPayload,
        warrantyInfo: form.warrantyInfo.trim(),
        returnInfo: form.returnInfo.trim(),
        lowStockThreshold: Number(form.lowStockThreshold || 5),
        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),
      };

      if (!editing) {
        const created = await api.post<{ id: string }>('/admin/products', {
          ...productPayload,
          costPrice: canCost && form.costPrice ? toSantim(form.costPrice) : undefined,
          images: imagePayload,
          variants: variants.map((variant) => ({
            sku: variant.sku.trim(),
            barcode: variant.barcode.trim(),
            optionValues: parseOptionValues(variant.optionValues),
            price: toSantim(variant.price),
            compareAtPrice: variant.compareAtPrice ? toSantim(variant.compareAtPrice) : undefined,
            isActive: variant.isActive,
            quantity: canInventory ? Number(variant.quantity || 0) : 0,
            lowStockThreshold: Number(variant.lowStockThreshold || 5),
          })),
        });
        return created.id;
      }

      await api.patch(`/admin/products/${productId}`, productPayload);
      await api.put(`/admin/products/${productId}/images`, { images: imagePayload });
      if (canCost) {
        await api.put(`/admin/products/${productId}/cost`, {
          costPrice: form.costPrice ? toSantim(form.costPrice) : null,
        });
      }
      for (const variant of variants) {
        const payload = {
          sku: variant.sku.trim(),
          barcode: variant.barcode.trim(),
          optionValues: parseOptionValues(variant.optionValues),
          price: toSantim(variant.price),
          compareAtPrice: variant.compareAtPrice ? toSantim(variant.compareAtPrice) : undefined,
          isActive: variant.isActive,
          ...(canInventory ? { lowStockThreshold: Number(variant.lowStockThreshold || 5) } : {}),
        };
        if (variant.id) {
          await api.patch(`/admin/products/${productId}/variants/${variant.id}`, payload);
        } else {
          await api.post(`/admin/products/${productId}/variants`, {
            ...payload,
            quantity: canInventory ? Number(variant.quantity || 0) : 0,
          });
        }
      }
      return productId as string;
    },
    onSuccess: (id) => {
      toast(editing ? 'Product saved' : 'Product created');
      void invalidate();
      if (!editing) navigate(`/admin/products/${id}`, { replace: true });
      else void product.refetch();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const removeVariantMutation = useMutation({
    mutationFn: (target: { id?: string; key: string }) => {
      if (target.id) return api.delete(`/admin/products/${productId}/variants/${target.id}`);
      return Promise.resolve(null);
    },
    onSuccess: (_result, target) => {
      setVariants((current) => current.filter((variant) => variant.key !== target.key));
      setRemoveVariant(null);
      if (target.id) {
        toast('Variant removed');
        void invalidate();
      }
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.post(`/admin/products/${productId}/archive`),
    onSuccess: () => {
      toast('Product archived');
      setArchiveOpen(false);
      void invalidate();
      navigate('/admin/products');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/admin/products/${productId}`),
    onSuccess: () => {
      toast('Product deleted');
      void invalidate();
      navigate('/admin/products');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const totalStock = useMemo(
    () => variants.reduce((sum, variant) => sum + (Number(variant.quantity) || 0), 0),
    [variants],
  );

  if (editing && product.isError) {
    return (
      <div className="space-y-3">
        <AdminPageHeader
          title="Product"
          back={{ to: '/admin/products', label: 'Back to products' }}
        />
        <ErrorNotice message={errorMessage(product.error)} />
      </div>
    );
  }

  if (editing && (product.isLoading || !hydrated)) {
    return <AdminLoading label="Loading product…" />;
  }

  const loaded = product.data?.product;

  function patchVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((current) => current.map((variant) => (variant.key === key ? { ...variant, ...patch } : variant)));
  }

  return (
    <div>
      <AdminPageHeader
        title={editing ? form.name || loaded?.name || 'Product' : 'New product'}
        eyebrow={editing ? 'Edit product' : 'Create product'}
        back={{ to: '/admin/products', label: 'Back to products' }}
        description={
          editing ? (
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={loaded?.status ?? form.status} />
              <span className="text-xs text-slate-warm">
                {totalStock} units on hand · {variants.length} variants
              </span>
            </span>
          ) : (
            'Add a product with its first variant. You can extend imagery, specs and options at any time.'
          )
        }
        actions={
          canWrite ? (
            <>
              {editing && loaded?.status !== 'archived' && (
                <Button variant="outline" onClick={() => setArchiveOpen(true)} iconLeft={<Archive className="size-4" />}>
                  Archive
                </Button>
              )}
              {editing && canDelete && (
                <Button variant="outline" onClick={() => setDeleteOpen(true)} iconLeft={<Trash2 className="size-4" />}>
                  Delete
                </Button>
              )}
              <Button loading={save.isPending} onClick={() => save.mutate()} iconLeft={<Save className="size-4" />}>
                {editing ? 'Save changes' : 'Create product'}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Section title="Basics" description="Customer-facing name, description and identifiers.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Product name">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      maxLength={160}
                      disabled={!canWrite}
                    />
                  )}
                </Field>
              </div>
              <Field label="Base SKU">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.sku}
                    onChange={(event) => setForm({ ...form, sku: event.target.value })}
                    maxLength={80}
                    disabled={!canWrite || editing}
                  />
                )}
              </Field>
              <Field label="Barcode">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.barcode}
                    onChange={(event) => setForm({ ...form, barcode: event.target.value })}
                    maxLength={80}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              <div className="sm:col-span-2">
                <Field label="Short description" hint="Shown on cards and search results.">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={form.shortDescription}
                      onChange={(event) => setForm({ ...form, shortDescription: event.target.value })}
                      maxLength={300}
                      disabled={!canWrite}
                    />
                  )}
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Full description">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                      className="min-h-40"
                      maxLength={10_000}
                      disabled={!canWrite}
                    />
                  )}
                </Field>
              </div>
              <Field label="Web address" hint="Lowercase letters, numbers and hyphens. Leave blank to generate.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.slug}
                    onChange={(event) => setForm({ ...form, slug: event.target.value })}
                    maxLength={140}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              <Field label="Brand">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.brandId}
                    onChange={(event) => setForm({ ...form, brandId: event.target.value })}
                    disabled={!canWrite}
                  >
                    <option value="">No brand</option>
                    {(brands.data?.brands ?? []).map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section title="Pricing">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base price (ETB)">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.basePrice}
                    onChange={(event) => setForm({ ...form, basePrice: event.target.value })}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              <Field label="Compare-at price (ETB)" hint="Optional. Shows a strike-through when higher than the price.">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.compareAtPrice}
                    onChange={(event) => setForm({ ...form, compareAtPrice: event.target.value })}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              {canCost && (
                <Field label="Cost price (ETB)" hint="Private. Visible to inventory and finance roles only.">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.costPrice}
                      onChange={(event) => setForm({ ...form, costPrice: event.target.value })}
                    />
                  )}
                </Field>
              )}
            </div>
          </Section>

          <Section
            title="Variants & stock"
            description={
              canInventory
                ? 'Each variant carries its own SKU, price and stock. Opening stock is recorded as a movement.'
                : 'Stock quantities are managed by inventory roles; contact them to adjust stock.'
            }
          >
            <div className="space-y-4">
              {variants.map((variant, index) => (
                <div key={variant.key} className="rounded-xl border border-line/80 bg-cream/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[12px] font-bold uppercase tracking-wide text-slate-warm">
                        Variant {index + 1}
                      </p>
                      {variant.id ? <Badge tone="outline">Saved</Badge> : <Badge tone="gold">New</Badge>}
                      {!variant.isActive && <Badge tone="neutral">Inactive</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() =>
                        setRemoveVariant({ key: variant.key, id: variant.id, sku: variant.sku || 'this variant' })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="SKU">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={variant.sku}
                          onChange={(event) => patchVariant(variant.key, { sku: event.target.value })}
                          maxLength={80}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                    <Field label="Options" hint="e.g. Colour=Black, Size=Large">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={variant.optionValues}
                          onChange={(event) => patchVariant(variant.key, { optionValues: event.target.value })}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                    <Field label="Price (ETB)">
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.price}
                          onChange={(event) => patchVariant(variant.key, { price: event.target.value })}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                    <Field label="Compare-at (ETB)">
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.compareAtPrice}
                          onChange={(event) => patchVariant(variant.key, { compareAtPrice: event.target.value })}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                    <Field label={variant.id ? 'Stock on hand' : 'Opening stock'}>
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min="0"
                          step="1"
                          value={variant.quantity}
                          onChange={(event) => patchVariant(variant.key, { quantity: event.target.value })}
                          disabled={!canInventory || Boolean(variant.id)}
                        />
                      )}
                    </Field>
                    <Field label="Low-stock threshold">
                      {({ id }) => (
                        <Input
                          id={id}
                          type="number"
                          min="0"
                          step="1"
                          value={variant.lowStockThreshold}
                          onChange={(event) =>
                            patchVariant(variant.key, { lowStockThreshold: event.target.value })
                          }
                          disabled={!canInventory}
                        />
                      )}
                    </Field>
                    <Field label="Barcode">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={variant.barcode}
                          onChange={(event) => patchVariant(variant.key, { barcode: event.target.value })}
                          maxLength={80}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                    <div className="flex items-end pb-2">
                      <label className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-brand-900">
                        <input
                          type="checkbox"
                          className="size-4 accent-brand-900"
                          checked={variant.isActive}
                          onChange={(event) => patchVariant(variant.key, { isActive: event.target.checked })}
                          disabled={!canWrite}
                        />
                        Available for sale
                      </label>
                    </div>
                  </div>
                  {variant.id && (
                    <p className="mt-2 text-[11px] text-slate-warm">
                      Stock changes are made from Inventory so every movement is audited.
                    </p>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                iconLeft={<Plus className="size-4" />}
                onClick={() => setVariants([...variants, emptyVariant()])}
                disabled={!canWrite}
              >
                Add variant
              </Button>
            </div>
          </Section>

          <Section title="Media" description="Up to eight images. The first is used as the primary thumbnail.">
            <div className="space-y-4">
              {images.map((image, index) => (
                <div key={`${image.id ?? 'new'}-${index}`} className="rounded-xl border border-line/70 bg-cream/40 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[12px] font-bold uppercase tracking-wide text-slate-warm">
                      {index === 0 ? 'Primary image' : `Image ${index + 1}`}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setImages(images.filter((_entry, position) => position !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                    <ImageUploadField
                      label="Image"
                      value={image.url}
                      onChange={(url) =>
                        setImages(images.map((entry, position) => (position === index ? { ...entry, url } : entry)))
                      }
                    />
                    <Field label="Alt text" hint="Describe the image for screen readers and search engines.">
                      {({ id }) => (
                        <Input
                          id={id}
                          value={image.alt}
                          onChange={(event) =>
                            setImages(
                              images.map((entry, position) =>
                                position === index ? { ...entry, alt: event.target.value } : entry,
                              ),
                            )
                          }
                          maxLength={200}
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                iconLeft={<ImagePlus className="size-4" />}
                onClick={() => setImages([...images, { url: '', alt: '' }])}
                disabled={!canWrite || images.length >= 8}
              >
                Add image
              </Button>
            </div>
          </Section>

          <Section title="Specifications">
            <div className="space-y-3">
              {specs.map((spec, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-[140px] flex-1">
                    <Field label={index === 0 ? 'Label' : undefined}>
                      {({ id }) => (
                        <Input
                          id={id}
                          value={spec.label}
                          placeholder="e.g. Material"
                          maxLength={80}
                          onChange={(event) =>
                            setSpecs(
                              specs.map((entry, position) =>
                                position === index ? { ...entry, label: event.target.value } : entry,
                              ),
                            )
                          }
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                  </div>
                  <div className="min-w-[180px] flex-[2]">
                    <Field label={index === 0 ? 'Value' : undefined}>
                      {({ id }) => (
                        <Input
                          id={id}
                          value={spec.value}
                          placeholder="e.g. Full-grain leather"
                          maxLength={300}
                          onChange={(event) =>
                            setSpecs(
                              specs.map((entry, position) =>
                                position === index ? { ...entry, value: event.target.value } : entry,
                              ),
                            )
                          }
                          disabled={!canWrite}
                        />
                      )}
                    </Field>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setSpecs(specs.filter((_entry, position) => position !== index))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                iconLeft={<Plus className="size-4" />}
                onClick={() => setSpecs([...specs, { label: '', value: '' }])}
                disabled={!canWrite || specs.length >= 20}
              >
                Add specification
              </Button>
            </div>
          </Section>

          <Section title="Search engine listing">
            <div className="grid gap-4">
              <Field label="Meta title" hint="Aim for 50–60 characters.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={form.metaTitle}
                    onChange={(event) => setForm({ ...form, metaTitle: event.target.value })}
                    maxLength={160}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              <Field label="Meta description" hint="Aim for 140–160 characters.">
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={form.metaDescription}
                    onChange={(event) => setForm({ ...form, metaDescription: event.target.value })}
                    maxLength={320}
                    disabled={!canWrite}
                  />
                )}
              </Field>
            </div>
          </Section>
        </div>

        <div className="space-y-5">
          <Section title="Organisation">
            <div className="space-y-4">
              <Field label="Status">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                    disabled={!canWrite}
                  >
                    <option value="draft">Draft — not visible</option>
                    <option value="active">Active — published</option>
                  </Select>
                )}
              </Field>
              <Field label="Category">
                {({ id }) => (
                  <Select
                    id={id}
                    value={form.categoryId}
                    onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                    disabled={!canWrite}
                  >
                    <option value="">No category</option>
                    {(categories.data?.categories ?? []).map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.parentId ? '— ' : ''}
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <label className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2.5 text-[12.5px] text-brand-900">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand-900"
                  checked={form.isFeatured}
                  onChange={(event) => setForm({ ...form, isFeatured: event.target.checked })}
                  disabled={!canWrite}
                />
                Feature this product on the storefront.
              </label>
              <Field label="Low-stock threshold" hint="Used as the default for new variants.">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    step="1"
                    value={form.lowStockThreshold}
                    onChange={(event) => setForm({ ...form, lowStockThreshold: event.target.value })}
                    disabled={!canWrite || !canInventory}
                  />
                )}
              </Field>
            </div>
          </Section>

          <Section title="Service & returns">
            <div className="space-y-4">
              <Field label="Warranty information">
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={form.warrantyInfo}
                    onChange={(event) => setForm({ ...form, warrantyInfo: event.target.value })}
                    maxLength={500}
                    disabled={!canWrite}
                  />
                )}
              </Field>
              <Field label="Return information">
                {({ id }) => (
                  <Textarea
                    id={id}
                    value={form.returnInfo}
                    onChange={(event) => setForm({ ...form, returnInfo: event.target.value })}
                    maxLength={500}
                    disabled={!canWrite}
                  />
                )}
              </Field>
            </div>
          </Section>

          {editing && loaded && (
            <Section title="Performance">
              <dl className="space-y-2 text-[12.5px]">
                <div className="flex justify-between">
                  <dt className="text-slate-warm">Sold</dt>
                  <dd className="font-semibold text-brand-900">{loaded.soldCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-warm">Views</dt>
                  <dd className="font-semibold text-brand-900">{loaded.viewCount}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-warm">Rating</dt>
                  <dd className="font-semibold text-brand-900">
                    {loaded.ratingCount ? `${loaded.ratingAvg} / 5 (${loaded.ratingCount})` : 'No reviews'}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-warm">Price on record</dt>
                  <dd className="font-semibold text-brand-900">{formatSantim(loaded.basePrice)}</dd>
                </div>
              </dl>
            </Section>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(removeVariant)}
        onClose={() => setRemoveVariant(null)}
        onConfirm={() => removeVariant && removeVariantMutation.mutate(removeVariant)}
        loading={removeVariantMutation.isPending}
        title="Remove variant"
        confirmLabel="Remove variant"
        destructive
        description={
          <>
            Remove <strong>{removeVariant?.sku}</strong> from this product? A product must keep at least one variant,
            and variants reserved for open orders cannot be removed.
          </>
        }
      />

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveMutation.mutate()}
        loading={archiveMutation.isPending}
        title="Archive product"
        confirmLabel="Archive product"
        description="The product will disappear from the storefront but past orders keep their record. You can still see it in the admin catalogue."
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Delete product"
        confirmLabel="Delete permanently"
        destructive
        description="This permanently removes the product and its variants. Products with order history cannot be deleted — archive them instead."
      />
    </div>
  );
}
