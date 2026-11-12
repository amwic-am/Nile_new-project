import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
} from '@/components/ui';
import { errorMessage } from '@/lib/api';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useUpdateAddress,
  type AddressInput,
} from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useToasts } from '@/stores/toasts';
import type { Address } from '@/lib/types';

const schema = z.object({
  label: z.string().trim().min(1, 'Give this address a name').max(40),
  fullName: z.string().trim().min(2, 'Enter the recipient name').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{7,30}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(3, 'Enter the street address').max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  region: z.string().trim().max(80),
  postalCode: z.string().trim().max(20),
  country: z.string().trim().length(2),
  isDefault: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function emptyValues(): FormValues {
  return {
    label: 'Home',
    fullName: '',
    phone: '',
    line1: '',
    line2: '',
    city: 'Addis Ababa',
    region: '',
    postalCode: '',
    country: 'ET',
    isDefault: false,
  };
}

function valuesFrom(address: Address): FormValues {
  return {
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    region: address.region,
    postalCode: address.postalCode ?? '',
    country: address.country,
    isDefault: address.isDefault,
  };
}

function toInput(values: FormValues, isDefault = values.isDefault): AddressInput {
  return {
    label: values.label,
    fullName: values.fullName,
    phone: values.phone,
    line1: values.line1,
    line2: values.line2 || null,
    city: values.city,
    region: values.region,
    postalCode: values.postalCode || null,
    country: values.country,
    isDefault,
  };
}

export default function AccountAddressesPage() {
  const { data, isLoading, isError, error, refetch } = useAddresses(true);
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();
  const push = useToasts((state) => state.push);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Address | undefined>(undefined);
  const [deleting, setDeleting] = useState<Address | null>(null);

  useSeo({
    title: 'Saved addresses',
    description: 'Manage delivery addresses saved to your Nile Mart account.',
    canonicalPath: '/account/addresses',
    noIndex: true,
  });

  const addresses = data?.addresses ?? [];

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditing(address);
    setFormOpen(true);
  };

  const makeDefault = (address: Address) => {
    updateAddress.mutate({
      id: address.id,
      data: toInput(valuesFrom(address), true),
    }, {
      onSuccess: (result) => push(result.message),
      onError: (caught) => push(errorMessage(caught), 'error'),
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    deleteAddress.mutate(deleting.id, {
      onSuccess: (result) => {
        setDeleting(null);
        push(result.message, 'info');
      },
      onError: (caught) => push(errorMessage(caught), 'error'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-display text-lg font-bold text-brand-900">Saved addresses</h2>
          <p className="mt-0.5 text-[12px] text-slate-warm">
            Up to 10 addresses. Your default is preselected at checkout.
          </p>
        </div>
        <Button size="sm" iconLeft={<Plus className="size-3.5" />} onClick={openCreate}>
          Add address
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="surface">
          <EmptyState
            icon={<MapPin className="size-6" />}
            title="We could not load your addresses"
            description={errorMessage(error)}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        </div>
      ) : addresses.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<MapPin className="size-6" />}
            title="No saved addresses"
            description="Add a delivery address so checkout takes less time."
            action={
              <Button iconLeft={<Plus className="size-4" />} onClick={openCreate}>
                Add your first address
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <article
              key={address.id}
              className={`flex flex-col rounded-2xl border bg-white p-5 shadow-soft ${
                address.isDefault ? 'border-brand-900/20 ring-1 ring-brand-900/10' : 'border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-900">
                    <MapPin className="size-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-brand-900">{address.label}</p>
                    {address.isDefault && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-gold-700">
                        <Star className="size-3 fill-current" /> Default
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(address)}
                    className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-cream hover:text-brand-900"
                    aria-label={`Edit ${address.label} address`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(address)}
                    className="grid size-8 place-items-center rounded-lg text-slate-warm transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Delete ${address.label} address`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex-1 text-[12px] leading-relaxed text-slate-warm">
                <p className="font-semibold text-brand-900">{address.fullName}</p>
                <p>{[address.line1, address.line2].filter(Boolean).join(', ')}</p>
                <p>{[address.city, address.region].filter(Boolean).join(', ')}</p>
                <p>{address.country === 'ET' ? 'Ethiopia' : address.country}</p>
                <p className="mt-1">{address.phone}</p>
              </div>

              {!address.isDefault && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 self-start"
                  loading={updateAddress.isPending}
                  onClick={() => makeDefault(address)}
                >
                  Set as default
                </Button>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Edit address' : 'Add a delivery address'}
      >
        <AddressForm
          key={editing?.id ?? 'new'}
          address={editing}
          onCancel={() => setFormOpen(false)}
          onSaved={(message) => {
            setFormOpen(false);
            push(message);
          }}
        />
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Delete this address?" size="sm">
        <p className="text-[12.5px] leading-relaxed text-slate-warm">
          {deleting?.label} will be removed from your account. Orders already placed keep their delivery details.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>
            Keep address
          </Button>
          <Button variant="danger" loading={deleteAddress.isPending} onClick={confirmDelete}>
            Delete address
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AddressForm({
  address,
  onCancel,
  onSaved,
}: {
  address?: Address;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();
  const push = useToasts((state) => state.push);
  const [serverError, setServerError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: address ? valuesFrom(address) : emptyValues(),
  });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const result = address
        ? await updateAddress.mutateAsync({ id: address.id, data: toInput(values) })
        : await createAddress.mutateAsync(toInput(values));
      onSaved(result.message);
    } catch (error) {
      const message = errorMessage(error);
      setServerError(message);
      push(message, 'error');
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {serverError && (
        <div className="rounded-xl bg-red-50 px-3.5 py-3 text-[12.5px] font-medium text-red-700">
          {serverError}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Address name" error={errors.label?.message}>
          {({ id }) => (
            <Input id={id} placeholder="Home, Office…" invalid={Boolean(errors.label)} {...register('label')} />
          )}
        </Field>
        <Field label="Recipient name" error={errors.fullName?.message}>
          {({ id }) => (
            <Input
              id={id}
              autoComplete="name"
              invalid={Boolean(errors.fullName)}
              {...register('fullName')}
            />
          )}
        </Field>
      </div>

      <Field label="Phone number" error={errors.phone?.message}>
        {({ id }) => (
          <Input
            id={id}
            type="tel"
            autoComplete="tel"
            placeholder="+251 911 234 567"
            invalid={Boolean(errors.phone)}
            {...register('phone')}
          />
        )}
      </Field>

      <Field label="Street address" error={errors.line1?.message}>
        {({ id }) => (
          <Input
            id={id}
            autoComplete="address-line1"
            placeholder="Building, street, area"
            invalid={Boolean(errors.line1)}
            {...register('line1')}
          />
        )}
      </Field>

      <Field label="Apartment, floor or landmark (optional)">
        {({ id }) => (
          <Input id={id} autoComplete="address-line2" placeholder="5th floor, Zemen Bank Building" {...register('line2')} />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" error={errors.city?.message}>
          {({ id }) => (
            <Input id={id} autoComplete="address-level2" invalid={Boolean(errors.city)} {...register('city')} />
          )}
        </Field>
        <Field label="Region / sub-city">
          {({ id }) => (
            <Input id={id} autoComplete="address-level1" placeholder="Bole" {...register('region')} />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Postal code (optional)">
          {({ id }) => <Input id={id} autoComplete="postal-code" placeholder="1000" {...register('postalCode')} />}
        </Field>
        <Field label="Country">
          {({ id }) => (
            <Select id={id} {...register('country')}>
              <option value="ET">Ethiopia</option>
            </Select>
          )}
        </Field>
      </div>

      <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-cream/50 px-3.5 py-3 text-[12px] text-slate-warm">
        <input type="checkbox" className="size-4 rounded border-line accent-brand-900" {...register('isDefault')} />
        Use this as my default delivery address
      </label>

      <div className="flex justify-end gap-2 border-t border-line/70 pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {address ? 'Save changes' : 'Save address'}
        </Button>
      </div>
    </form>
  );
}
