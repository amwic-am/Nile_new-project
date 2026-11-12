import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  ImageUploadField,
  Panel,
  StatusBadge,
  Td,
  Th,
} from '@/components/admin/ui';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import {
  useAdminBrands,
  useAdminCategories,
  useAdminInvalidate,
  type AdminBrand,
  type AdminCategory,
} from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { toast } from '@/stores/toasts';
import { useAuth } from '@/stores/auth';

interface CategoryDraft {
  id?: string;
  name: string;
  slug: string;
  parentId: string;
  description: string;
  imageUrl: string;
  position: string;
  isActive: boolean;
  metaTitle: string;
  metaDescription: string;
}

interface BrandDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string;
  websiteUrl: string;
  isActive: boolean;
}

const emptyCategory = (): CategoryDraft => ({
  name: '',
  slug: '',
  parentId: '',
  description: '',
  imageUrl: '',
  position: '0',
  isActive: true,
  metaTitle: '',
  metaDescription: '',
});

const emptyBrand = (): BrandDraft => ({
  name: '',
  slug: '',
  description: '',
  logoUrl: '',
  websiteUrl: '',
  isActive: true,
});

export default function AdminCategoriesPage() {
  const categories = useAdminCategories();
  const brands = useAdminBrands();
  const invalidate = useAdminInvalidate();
  const permissions = useAuth((state) => state.user?.permissions ?? []);
  const canCategories = permissions.includes('categories.write');
  const canBrands = permissions.includes('brands.write');

  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null);
  const [brandDraft, setBrandDraft] = useState<BrandDraft | null>(null);
  const [removal, setRemoval] = useState<{ type: 'category' | 'brand'; id: string; name: string } | null>(null);

  const saveCategory = useMutation({
    mutationFn: (draft: CategoryDraft) => {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || undefined,
        parentId: draft.parentId || null,
        description: draft.description.trim(),
        imageUrl: draft.imageUrl.trim(),
        position: Number(draft.position || 0),
        isActive: draft.isActive,
        metaTitle: draft.metaTitle.trim(),
        metaDescription: draft.metaDescription.trim(),
      };
      if (draft.id) return api.patch(`/admin/categories/${draft.id}`, payload);
      return api.post('/admin/categories', payload);
    },
    onSuccess: () => {
      toast(categoryDraft?.id ? 'Category updated' : 'Category created');
      setCategoryDraft(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const saveBrand = useMutation({
    mutationFn: (draft: BrandDraft) => {
      const payload = {
        name: draft.name.trim(),
        slug: draft.slug.trim() || undefined,
        description: draft.description.trim(),
        logoUrl: draft.logoUrl.trim(),
        websiteUrl: draft.websiteUrl.trim(),
        isActive: draft.isActive,
      };
      if (draft.id) return api.patch(`/admin/brands/${draft.id}`, payload);
      return api.post('/admin/brands', payload);
    },
    onSuccess: () => {
      toast(brandDraft?.id ? 'Brand updated' : 'Brand created');
      setBrandDraft(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: (target: NonNullable<typeof removal>) =>
      api.delete(`/admin/${target.type === 'category' ? 'categories' : 'brands'}/${target.id}`),
    onSuccess: () => {
      toast('Deleted');
      setRemoval(null);
      void invalidate();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  function editCategory(category: AdminCategory) {
    setCategoryDraft({
      id: category.id,
      name: category.name,
      slug: category.slug,
      parentId: category.parentId ?? '',
      description: category.description,
      imageUrl: category.imageUrl ?? '',
      position: String(category.position),
      isActive: category.isActive,
      metaTitle: category.metaTitle ?? '',
      metaDescription: category.metaDescription ?? '',
    });
  }

  function editBrand(brand: AdminBrand) {
    setBrandDraft({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      description: brand.description,
      logoUrl: brand.logoUrl ?? '',
      websiteUrl: brand.websiteUrl ?? '',
      isActive: brand.isActive,
    });
  }

  const categoryList = categories.data?.categories ?? [];
  const brandList = brands.data?.brands ?? [];
  const categoryNames = new Map(categoryList.map((category) => [category.id, category.name]));

  return (
    <div>
      <AdminPageHeader
        title="Categories & brands"
        description="Shape how customers browse the catalogue. Ordering here controls the navigation and filter menus."
        eyebrow="Commerce"
      />

      <div className="space-y-6">
        <Panel
          title="Categories"
          description="Use subcategories for a second level in the storefront navigation."
          action={
            canCategories ? (
              <Button size="sm" onClick={() => setCategoryDraft(emptyCategory())} iconLeft={<Plus className="size-4" />}>
                New category
              </Button>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          {categories.isError ? (
            <div className="p-5">
              <ErrorNotice message={errorMessage(categories.error)} />
            </div>
          ) : categories.isLoading ? (
            <AdminLoading label="Loading categories…" />
          ) : !categoryList.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-warm">No categories yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <Th>Category</Th>
                    <Th>Web address</Th>
                    <Th>Parent</Th>
                    <Th align="right">Products</Th>
                    <Th align="center">Order</Th>
                    <Th>Status</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {categoryList.map((category) => (
                    <tr key={category.id} className="transition hover:bg-cream/50">
                      <Td>
                        <div className="flex items-center gap-2.5">
                          {category.parentId && <span className="text-slate-warm">↳</span>}
                          <span className="font-semibold text-brand-900">{category.name}</span>
                        </div>
                      </Td>
                      <Td className="text-[12px] text-slate-warm">/{category.slug}</Td>
                      <Td className="text-[12.5px] text-slate-warm">
                        {category.parentId ? categoryNames.get(category.parentId) ?? '—' : 'Top level'}
                      </Td>
                      <Td align="right" className="text-[12.5px] text-slate-warm">
                        {category.productCount}
                      </Td>
                      <Td align="center" className="text-[12.5px] text-slate-warm">
                        {category.position}
                      </Td>
                      <Td>
                        <StatusBadge status={category.isActive ? 'active' : 'inactive'} />
                      </Td>
                      <Td align="right">
                        {canCategories && (
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() => editCategory(category)}
                              className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-sand hover:text-brand-900"
                              aria-label={`Edit ${category.name}`}
                            >
                              <Pencil className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoval({ type: 'category', id: category.id, name: category.name })}
                              className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-red-50 hover:text-red-600"
                              aria-label={`Delete ${category.name}`}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Brands"
          description="Brand pages help customers discover complementary products."
          action={
            canBrands ? (
              <Button size="sm" onClick={() => setBrandDraft(emptyBrand())} iconLeft={<Plus className="size-4" />}>
                New brand
              </Button>
            ) : undefined
          }
          bodyClassName="p-0"
        >
          {brands.isError ? (
            <div className="p-5">
              <ErrorNotice message={errorMessage(brands.error)} />
            </div>
          ) : brands.isLoading ? (
            <AdminLoading label="Loading brands…" />
          ) : !brandList.length ? (
            <p className="px-5 py-10 text-center text-sm text-slate-warm">No brands yet.</p>
          ) : (
            <DataTable className="min-w-[720px]">
              <thead>
                <tr>
                  <Th>Brand</Th>
                  <Th>Web address</Th>
                  <Th>Website</Th>
                  <Th align="right">Products</Th>
                  <Th>Status</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {brandList.map((brand) => (
                  <tr key={brand.id} className="transition hover:bg-cream/50">
                    <Td>
                      <div className="flex items-center gap-3">
                        {brand.logoUrl ? (
                          <img src={brand.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
                        ) : (
                          <div className="grid size-9 place-items-center rounded-lg bg-sand text-slate-warm">
                            <Tags className="size-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-brand-900">{brand.name}</p>
                          {brand.description && (
                            <p className="max-w-xs truncate text-[11.5px] text-slate-warm">{brand.description}</p>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[12px] text-slate-warm">/{brand.slug}</Td>
                    <Td className="text-[12px] text-slate-warm">
                      {brand.websiteUrl ? (
                        <a href={brand.websiteUrl} target="_blank" rel="noreferrer" className="underline">
                          Visit
                        </a>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td align="right" className="text-[12.5px] text-slate-warm">
                      {brand.productCount}
                    </Td>
                    <Td>
                      <StatusBadge status={brand.isActive ? 'active' : 'inactive'} />
                    </Td>
                    <Td align="right">
                      {canBrands && (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => editBrand(brand)}
                            className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-sand hover:text-brand-900"
                            aria-label={`Edit ${brand.name}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemoval({ type: 'brand', id: brand.id, name: brand.name })}
                            className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-red-50 hover:text-red-600"
                            aria-label={`Delete ${brand.name}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      </div>

      <Modal
        open={Boolean(categoryDraft)}
        onClose={() => setCategoryDraft(null)}
        title={categoryDraft?.id ? 'Edit category' : 'New category'}
      >
        {categoryDraft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {({ id }) => (
                  <Input
                    id={id}
                    value={categoryDraft.name}
                    onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })}
                    maxLength={120}
                  />
                )}
              </Field>
              <Field label="Web address" hint="Leave blank to generate from the name.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={categoryDraft.slug}
                    onChange={(event) => setCategoryDraft({ ...categoryDraft, slug: event.target.value })}
                    maxLength={140}
                  />
                )}
              </Field>
              <Field label="Parent category">
                {({ id }) => (
                  <Select
                    id={id}
                    value={categoryDraft.parentId}
                    onChange={(event) => setCategoryDraft({ ...categoryDraft, parentId: event.target.value })}
                  >
                    <option value="">Top level</option>
                    {categoryList
                      .filter((category) => category.id !== categoryDraft.id && !category.parentId)
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </Select>
                )}
              </Field>
              <Field label="Order" hint="Lower numbers appear first.">
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min="0"
                    value={categoryDraft.position}
                    onChange={(event) => setCategoryDraft({ ...categoryDraft, position: event.target.value })}
                  />
                )}
              </Field>
            </div>
            <Field label="Description">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={categoryDraft.description}
                  onChange={(event) => setCategoryDraft({ ...categoryDraft, description: event.target.value })}
                  maxLength={1000}
                />
              )}
            </Field>
            <ImageUploadField
              value={categoryDraft.imageUrl}
              onChange={(url) => setCategoryDraft({ ...categoryDraft, imageUrl: url })}
              label="Category image"
            />
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-900">
              <input
                type="checkbox"
                className="size-4 accent-brand-900"
                checked={categoryDraft.isActive}
                onChange={(event) => setCategoryDraft({ ...categoryDraft, isActive: event.target.checked })}
              />
              Show this category in the storefront
            </label>
            <details className="rounded-xl border border-line/70 px-3 py-2">
              <summary className="cursor-pointer text-[12px] font-semibold text-slate-warm">
                Search engine listing
              </summary>
              <div className="mt-3 space-y-3">
                <Field label="Meta title">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={categoryDraft.metaTitle}
                      onChange={(event) => setCategoryDraft({ ...categoryDraft, metaTitle: event.target.value })}
                      maxLength={160}
                    />
                  )}
                </Field>
                <Field label="Meta description">
                  {({ id }) => (
                    <Textarea
                      id={id}
                      value={categoryDraft.metaDescription}
                      onChange={(event) =>
                        setCategoryDraft({ ...categoryDraft, metaDescription: event.target.value })
                      }
                      maxLength={320}
                    />
                  )}
                </Field>
              </div>
            </details>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCategoryDraft(null)}>
                Cancel
              </Button>
              <Button
                loading={saveCategory.isPending}
                disabled={!categoryDraft.name.trim()}
                onClick={() => saveCategory.mutate(categoryDraft)}
              >
                {categoryDraft.id ? 'Save category' : 'Create category'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(brandDraft)}
        onClose={() => setBrandDraft(null)}
        title={brandDraft?.id ? 'Edit brand' : 'New brand'}
      >
        {brandDraft && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                {({ id }) => (
                  <Input
                    id={id}
                    value={brandDraft.name}
                    onChange={(event) => setBrandDraft({ ...brandDraft, name: event.target.value })}
                    maxLength={120}
                  />
                )}
              </Field>
              <Field label="Web address" hint="Leave blank to generate from the name.">
                {({ id }) => (
                  <Input
                    id={id}
                    value={brandDraft.slug}
                    onChange={(event) => setBrandDraft({ ...brandDraft, slug: event.target.value })}
                    maxLength={140}
                  />
                )}
              </Field>
            </div>
            <Field label="Website">
              {({ id }) => (
                <Input
                  id={id}
                  value={brandDraft.websiteUrl}
                  onChange={(event) => setBrandDraft({ ...brandDraft, websiteUrl: event.target.value })}
                  placeholder="https://"
                  maxLength={400}
                />
              )}
            </Field>
            <Field label="Description">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={brandDraft.description}
                  onChange={(event) => setBrandDraft({ ...brandDraft, description: event.target.value })}
                  maxLength={1000}
                />
              )}
            </Field>
            <ImageUploadField
              value={brandDraft.logoUrl}
              onChange={(url) => setBrandDraft({ ...brandDraft, logoUrl: url })}
              label="Brand logo"
            />
            <label className="flex items-center gap-2 text-[12.5px] font-semibold text-brand-900">
              <input
                type="checkbox"
                className="size-4 accent-brand-900"
                checked={brandDraft.isActive}
                onChange={(event) => setBrandDraft({ ...brandDraft, isActive: event.target.checked })}
              />
              Show this brand in the storefront
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBrandDraft(null)}>
                Cancel
              </Button>
              <Button
                loading={saveBrand.isPending}
                disabled={!brandDraft.name.trim()}
                onClick={() => saveBrand.mutate(brandDraft)}
              >
                {brandDraft.id ? 'Save brand' : 'Create brand'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removal)}
        onClose={() => setRemoval(null)}
        onConfirm={() => removal && remove.mutate(removal)}
        loading={remove.isPending}
        title={`Delete ${removal?.type ?? 'record'}`}
        confirmLabel="Delete"
        destructive
        description={
          <>
            Delete <strong>{removal?.name}</strong>? Categories and brands that still have children or products must be
            cleared first.
          </>
        }
      />
    </div>
  );
}
