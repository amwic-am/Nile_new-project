import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  FileText,
  Info,
  PencilLine,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  AdminTabs,
  ConfirmDialog,
  DataTable,
  ErrorNotice,
  Panel,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import {
  useAdminContent,
  useAdminInvalidate,
  useAdminSettings,
} from '@/lib/admin';
import type { AdminContentPage, AdminSettings } from '@/lib/admin';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toasts';

type Tab = 'store' | 'commerce' | 'payments' | 'content';

interface DeliveryDraft {
  id: string;
  label: string;
  description: string;
  fee: string;
  enabled: boolean;
}

interface SettingsForm {
  store: AdminSettings['store'];
  announcement: { enabled: boolean; message: string; link: string };
  deliveryMethods: DeliveryDraft[];
  freeShippingThreshold: string;
  socialLinks: { label: string; url: string }[];
  returns: { summary: string; windowDays: string };
  seo: AdminSettings['seo'];
  supportHours: AdminSettings['supportHours'];
  payments: { cod: boolean; chapa: boolean };
  invoice: AdminSettings['invoice'];
  reservations: { minutes: string; low_stock_threshold: string };
}

function toForm(settings: AdminSettings): SettingsForm {
  return {
    store: settings.store,
    announcement: {
      enabled: settings.announcement.enabled,
      message: settings.announcement.message,
      link: settings.announcement.link ?? '',
    },
    deliveryMethods: settings.deliveryMethods.map((method) => ({
      id: method.id,
      label: method.label,
      description: method.description,
      fee: String(method.fee / 100),
      enabled: method.enabled,
    })),
    freeShippingThreshold: String((settings.freeShippingThreshold ?? 0) / 100),
    socialLinks: settings.socialLinks.map((link) => ({ ...link })),
    returns: {
      summary: settings.returns.summary,
      windowDays: String(settings.returns.windowDays),
    },
    seo: settings.seo,
    supportHours: settings.supportHours,
    payments: { cod: settings.payments.cod, chapa: settings.payments.chapa },
    invoice: settings.invoice,
    reservations: {
      minutes: String(settings.reservations.minutes),
      low_stock_threshold: String(settings.reservations.low_stock_threshold),
    },
  };
}

function buildPatch(form: SettingsForm, baseline: SettingsForm): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const changed = (key: keyof SettingsForm) =>
    JSON.stringify(form[key]) !== JSON.stringify(baseline[key]);

  if (changed('store')) patch.store = form.store;
  if (changed('announcement')) {
    patch.announcement = {
      enabled: form.announcement.enabled,
      message: form.announcement.message,
      link: form.announcement.link.trim() || undefined,
    };
  }
  if (changed('deliveryMethods')) {
    patch.deliveryMethods = form.deliveryMethods.map((method) => ({
      id: method.id,
      label: method.label,
      description: method.description,
      fee: Math.round(Number(method.fee || 0) * 100),
      enabled: method.enabled,
    }));
  }
  if (changed('freeShippingThreshold')) {
    patch.freeShippingThreshold = Math.round(Number(form.freeShippingThreshold || 0) * 100);
  }
  if (changed('socialLinks')) {
    patch.socialLinks = form.socialLinks.filter((link) => link.label.trim() && link.url.trim());
  }
  if (changed('returns')) {
    patch.returns = {
      summary: form.returns.summary,
      windowDays: Number(form.returns.windowDays || 0),
    };
  }
  if (changed('seo')) patch.seo = form.seo;
  if (changed('supportHours')) patch.supportHours = form.supportHours;
  if (changed('payments')) patch.payments = form.payments;
  if (changed('invoice')) patch.invoice = form.invoice;
  if (changed('reservations')) {
    patch.reservations = {
      minutes: Number(form.reservations.minutes || 0),
      low_stock_threshold: Number(form.reservations.low_stock_threshold || 0),
    };
  }
  return patch;
}

export default function AdminSettingsPage() {
  const user = useAuth((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canReadSettings = permissions.includes('settings.read');
  const canWriteSettings = permissions.includes('settings.write');
  const canContent = permissions.includes('content.write');

  const tabs = useMemo(
    () =>
      [
        canReadSettings ? { key: 'store' as const, label: 'Store' } : null,
        canReadSettings ? { key: 'commerce' as const, label: 'Commerce' } : null,
        canReadSettings ? { key: 'payments' as const, label: 'Payments' } : null,
        canContent ? { key: 'content' as const, label: 'Content pages' } : null,
      ].filter((entry): entry is { key: Tab; label: string } => Boolean(entry)),
    [canReadSettings, canContent],
  );

  const [tab, setTab] = useState<Tab>('store');
  const active = tabs.some((entry) => entry.key === tab) ? tab : tabs[0]?.key;

  const settings = useAdminSettings(canReadSettings);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [baseline, setBaseline] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();

  useEffect(() => {
    if (!settings.data?.settings || form) return;
    const next = toForm(settings.data.settings);
    setForm(next);
    setBaseline(next);
  }, [settings.data, form]);

  const patch = form && baseline ? buildPatch(form, baseline) : {};
  const dirty = Object.keys(patch).length > 0;

  function update<K extends keyof SettingsForm>(section: K, value: SettingsForm[K]) {
    setForm((current) => (current ? { ...current, [section]: value } : current));
    setError(null);
  }

  async function save() {
    if (!form || !baseline || !dirty) return;
    if (!form.payments.cod && !form.payments.chapa) {
      setError('Enable at least one payment method before saving.');
      setTab('payments');
      return;
    }
    setSaving(true);
    setError(null);
    setErrors({});
    try {
      await api.patch('/admin/settings', patch);
      toast('Store settings saved');
      setBaseline(form);
      void invalidate();
    } catch (mutationError) {
      const fields = fieldErrors(mutationError);
      if (fields) setErrors(fields);
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  if (canReadSettings && settings.isLoading && !form) {
    return <AdminLoading label="Loading store settings…" />;
  }
  if (canReadSettings && settings.isError && !form) {
    return (
      <div className="space-y-3">
        <ErrorNotice message={errorMessage(settings.error)} />
        <Button variant="outline" size="sm" onClick={() => void settings.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Administration"
        title="Settings"
        description="Storefront identity, fulfilment rules, payment availability and policy pages. Changes apply immediately."
        actions={
          canWriteSettings ? (
            <Button
              iconLeft={<Save className="size-4" />}
              onClick={() => void save()}
              loading={saving}
              disabled={!dirty}
            >
              {dirty ? 'Save changes' : 'Saved'}
            </Button>
          ) : undefined
        }
      />

      {tabs.length > 1 && <AdminTabs className="mb-5" tabs={tabs} value={active ?? 'store'} onChange={setTab} />}

      {error && (
        <div className="mb-4">
          <ErrorNotice message={error} />
        </div>
      )}

      {active === 'store' && form && (
        <StoreTab form={form} update={update} readOnly={!canWriteSettings} meta={settings.data?.meta ?? []} />
      )}
      {active === 'commerce' && form && (
        <CommerceTab form={form} update={update} readOnly={!canWriteSettings} />
      )}
      {active === 'payments' && form && (
        <PaymentsTab
          form={form}
          update={update}
          readOnly={!canWriteSettings}
          providers={settings.data?.providers ?? []}
        />
      )}
      {active === 'content' && <ContentTab canWrite={canContent} />}
      {!active && (
        <div className="surface">
          <EmptyState title="No settings access" description="Your role does not include settings permissions." />
        </div>
      )}
    </div>
  );
}

interface TabProps {
  form: SettingsForm;
  update: <K extends keyof SettingsForm>(section: K, value: SettingsForm[K]) => void;
  readOnly: boolean;
}

function StoreTab({ form, update, readOnly, meta }: TabProps & { meta: { key: string; updatedAt: string; updatedBy: string | null }[] }) {
  const store = form.store;
  const setStore = (key: keyof typeof store, value: string) => update('store', { ...store, [key]: value });
  const setSeo = (key: keyof SettingsForm['seo'], value: string) => update('seo', { ...form.seo, [key]: value });
  const setHours = (key: keyof SettingsForm['supportHours'], value: string) =>
    update('supportHours', { ...form.supportHours, [key]: value });

  return (
    <div className="space-y-5">
      <Panel title="Store identity" description="Shown across the storefront, invoices and transactional email.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name">
            {({ id }) => (
              <Input id={id} value={store.name} onChange={(event) => setStore('name', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Legal name">
            {({ id }) => (
              <Input id={id} value={store.legalName} onChange={(event) => setStore('legalName', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Tagline">
            {({ id }) => (
              <Input id={id} value={store.tagline} onChange={(event) => setStore('tagline', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Support email">
            {({ id }) => (
              <Input id={id} type="email" value={store.email} onChange={(event) => setStore('email', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Phone">
            {({ id }) => (
              <Input id={id} value={store.phone} onChange={(event) => setStore('phone', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="City">
            {({ id }) => (
              <Input id={id} value={store.city} onChange={(event) => setStore('city', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Street address">
            {({ id }) => (
              <Input id={id} value={store.address} onChange={(event) => setStore('address', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Country">
            {({ id }) => (
              <Input id={id} value={store.country} onChange={(event) => setStore('country', event.target.value)} disabled={readOnly} />
            )}
          </Field>
          <Field label="Currency" hint="Prices are stored and charged in Ethiopian birr.">
            {({ id }) => <Input id={id} value={store.currency} disabled readOnly />}
          </Field>
          <Field label="Timezone">
            {({ id }) => (
              <Input id={id} value={store.timezone} onChange={(event) => setStore('timezone', event.target.value)} disabled={readOnly} />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="Announcement bar" description="A single line shown at the top of the storefront.">
        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <Field label="Visibility">
            {({ id }) => (
              <Select
                id={id}
                value={form.announcement.enabled ? 'on' : 'off'}
                onChange={(event) =>
                  update('announcement', { ...form.announcement, enabled: event.target.value === 'on' })
                }
                disabled={readOnly}
              >
                <option value="on">Visible</option>
                <option value="off">Hidden</option>
              </Select>
            )}
          </Field>
          <Field label="Message">
            {({ id }) => (
              <Input
                id={id}
                value={form.announcement.message}
                onChange={(event) => update('announcement', { ...form.announcement, message: event.target.value })}
                maxLength={200}
                disabled={readOnly}
              />
            )}
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Link" hint="Optional store path, for example /collections/new.">
            {({ id }) => (
              <Input
                id={id}
                value={form.announcement.link}
                onChange={(event) => update('announcement', { ...form.announcement, link: event.target.value })}
                placeholder="/collections/new"
                disabled={readOnly}
              />
            )}
          </Field>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Search & social metadata" description="Used by search engines and social previews.">
          <div className="space-y-4">
            <Field label="Meta title">
              {({ id }) => (
                <Input id={id} value={form.seo.title} onChange={(event) => setSeo('title', event.target.value)} disabled={readOnly} maxLength={160} />
              )}
            </Field>
            <Field label="Meta description">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={form.seo.description}
                  onChange={(event) => setSeo('description', event.target.value)}
                  rows={3}
                  maxLength={320}
                  disabled={readOnly}
                />
              )}
            </Field>
            <Field label="Keywords">
              {({ id }) => (
                <Input id={id} value={form.seo.keywords} onChange={(event) => setSeo('keywords', event.target.value)} disabled={readOnly} maxLength={320} />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Support hours" description="Shown on the contact page and in order emails.">
          <div className="space-y-4">
            <Field label="Weekdays & hours">
              {({ id }) => (
                <Input id={id} value={form.supportHours.weekdays} onChange={(event) => setHours('weekdays', event.target.value)} disabled={readOnly} />
              )}
            </Field>
            <Field label="Timezone">
              {({ id }) => (
                <Input id={id} value={form.supportHours.timezone} onChange={(event) => setHours('timezone', event.target.value)} disabled={readOnly} />
              )}
            </Field>
          </div>
        </Panel>
      </div>

      <Panel
        title="Social links"
        description="Displayed in the footer."
        action={
          !readOnly ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Plus className="size-3.5" />}
              onClick={() => update('socialLinks', [...form.socialLinks, { label: '', url: '' }])}
            >
              Add link
            </Button>
          ) : undefined
        }
      >
        {form.socialLinks.length === 0 ? (
          <p className="text-sm text-slate-warm">No social links configured.</p>
        ) : (
          <div className="space-y-2">
            {form.socialLinks.map((link, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  value={link.label}
                  onChange={(event) => {
                    const next = [...form.socialLinks];
                    next[index] = { ...link, label: event.target.value };
                    update('socialLinks', next);
                  }}
                  placeholder="Instagram"
                  className="h-10 w-40"
                  disabled={readOnly}
                  aria-label={`Social link ${index + 1} label`}
                />
                <Input
                  value={link.url}
                  onChange={(event) => {
                    const next = [...form.socialLinks];
                    next[index] = { ...link, url: event.target.value };
                    update('socialLinks', next);
                  }}
                  placeholder="https://instagram.com/nilemart"
                  className="h-10 min-w-0 flex-1"
                  disabled={readOnly}
                  aria-label={`Social link ${index + 1} URL`}
                />
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => update('socialLinks', form.socialLinks.filter((_, position) => position !== index))}
                    aria-label="Remove social link"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>

      {meta.length > 0 && (
        <Panel title="Last updated" description="Settings changes are audited.">
          <ul className="grid gap-2 text-[11.5px] text-slate-warm sm:grid-cols-2">
            {meta.map((entry) => (
              <li key={entry.key} className="flex items-center justify-between gap-3 border-b border-line/50 pb-1.5">
                <span className="font-mono">{entry.key}</span>
                <span>
                  {formatDateTime(entry.updatedAt)}
                  {entry.updatedBy ? ` · ${entry.updatedBy}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function CommerceTab({ form, update, readOnly }: TabProps) {
  const setMethod = (index: number, patch: Partial<DeliveryDraft>) => {
    const next = form.deliveryMethods.map((method, position) =>
      position === index ? { ...method, ...patch } : method,
    );
    update('deliveryMethods', next);
  };

  return (
    <div className="space-y-5">
      <Panel
        title="Delivery methods"
        description="Fees are added to checkout totals server-side."
        action={
          !readOnly ? (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Plus className="size-3.5" />}
              disabled={form.deliveryMethods.length >= 5}
              onClick={() =>
                update('deliveryMethods', [
                  ...form.deliveryMethods,
                  { id: '', label: '', description: '', fee: '0', enabled: true },
                ])
              }
            >
              Add method
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {form.deliveryMethods.map((method, index) => (
            <div key={index} className="rounded-xl border border-line/70 bg-cream/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Identifier" hint="Lowercase slug, e.g. standard.">
                  {({ id }) => (
                    <Input
                      id={id}
                      value={method.id}
                      onChange={(event) => setMethod(index, { id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                      disabled={readOnly}
                      className="h-10"
                    />
                  )}
                </Field>
                <Field label="Label">
                  {({ id }) => (
                    <Input id={id} value={method.label} onChange={(event) => setMethod(index, { label: event.target.value })} disabled={readOnly} className="h-10" />
                  )}
                </Field>
                <Field label="Fee (ETB)">
                  {({ id }) => (
                    <Input
                      id={id}
                      type="number"
                      min={0}
                      step="0.01"
                      value={method.fee}
                      onChange={(event) => setMethod(index, { fee: event.target.value })}
                      disabled={readOnly}
                      className="h-10"
                    />
                  )}
                </Field>
                <Field label="Availability">
                  {({ id }) => (
                    <Select
                      id={id}
                      value={method.enabled ? 'on' : 'off'}
                      onChange={(event) => setMethod(index, { enabled: event.target.value === 'on' })}
                      disabled={readOnly}
                      className="h-10"
                    >
                      <option value="on">Enabled</option>
                      <option value="off">Disabled</option>
                    </Select>
                  )}
                </Field>
              </div>
              <div className="mt-3 flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Field label="Description">
                    {({ id }) => (
                      <Input
                        id={id}
                        value={method.description}
                        onChange={(event) => setMethod(index, { description: event.target.value })}
                        disabled={readOnly}
                        className="h-10"
                      />
                    )}
                  </Field>
                </div>
                {!readOnly && form.deliveryMethods.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() =>
                      update('deliveryMethods', form.deliveryMethods.filter((_, position) => position !== index))
                    }
                    aria-label={`Remove ${method.label || 'delivery method'}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 max-w-xs">
          <Field label="Free delivery threshold (ETB)" hint="Set to 0 to disable free delivery.">
            {({ id }) => (
              <Input
                id={id}
                type="number"
                min={0}
                step="0.01"
                value={form.freeShippingThreshold}
                onChange={(event) => update('freeShippingThreshold', event.target.value)}
                disabled={readOnly}
                className="h-10"
              />
            )}
          </Field>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Returns policy" description="Shown on product and policy pages.">
          <div className="space-y-4">
            <Field label="Return window (days)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={90}
                  value={form.returns.windowDays}
                  onChange={(event) => update('returns', { ...form.returns, windowDays: event.target.value })}
                  disabled={readOnly}
                  className="h-10 w-32"
                />
              )}
            </Field>
            <Field label="Summary">
              {({ id }) => (
                <Textarea
                  id={id}
                  value={form.returns.summary}
                  onChange={(event) => update('returns', { ...form.returns, summary: event.target.value })}
                  rows={4}
                  maxLength={600}
                  disabled={readOnly}
                />
              )}
            </Field>
          </div>
        </Panel>

        <Panel title="Stock reservations" description="Checkout holds stock while a customer completes payment.">
          <div className="space-y-4">
            <Field label="Reservation window (minutes)">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={5}
                  max={10080}
                  value={form.reservations.minutes}
                  onChange={(event) =>
                    update('reservations', { ...form.reservations, minutes: event.target.value })
                  }
                  disabled={readOnly}
                  className="h-10 w-40"
                />
              )}
            </Field>
            <Field label="Default low-stock threshold" hint="Applied to new variants unless overridden.">
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={10000}
                  value={form.reservations.low_stock_threshold}
                  onChange={(event) =>
                    update('reservations', { ...form.reservations, low_stock_threshold: event.target.value })
                  }
                  disabled={readOnly}
                  className="h-10 w-40"
                />
              )}
            </Field>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PaymentsTab({
  form,
  update,
  readOnly,
  providers,
}: TabProps & { providers: { key: string; label: string; implemented: boolean; enabled: boolean }[] }) {
  return (
    <div className="space-y-5">
      <Panel
        title="Checkout payment methods"
        description="Only providers that are implemented and verified can be enabled for customers."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              key: 'cod' as const,
              label: 'Cash on delivery',
              description: 'Collect payment when the courier hands over the order.',
            },
            {
              key: 'chapa' as const,
              label: 'Chapa',
              description: 'Hosted checkout with verified server-side webhooks (sandbox credentials required).',
            },
          ].map((method) => {
            const enabled = form.payments[method.key];
            return (
              <div
                key={method.key}
                className={
                  enabled
                    ? 'rounded-xl border border-brand-900/40 bg-brand-50/50 p-4'
                    : 'rounded-xl border border-line bg-white p-4'
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-[14px] font-bold text-brand-900">{method.label}</p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-slate-warm">{method.description}</p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[11.5px] font-semibold text-brand-900">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={readOnly}
                      onChange={(event) =>
                        update('payments', { ...form.payments, [method.key]: event.target.checked })
                      }
                      className="size-4 accent-brand-900"
                    />
                    {enabled ? 'On' : 'Off'}
                  </label>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-cream/70 px-3 py-2 text-[11.5px] leading-relaxed text-slate-warm">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          At least one method must stay enabled. Telebirr, M-PESA, EPS, card and PayPal remain visible to staff but
          cannot be enabled until their adapters are implemented and tested.
        </p>
      </Panel>

      <Panel title="Provider status" description="Reflects what the backend can actually process today." bodyClassName="p-0">
        <DataTable>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>Adapter</Th>
              <Th>Checkout</Th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.key}>
                <Td className="font-semibold text-brand-900">{provider.label}</Td>
                <Td>
                  {provider.implemented ? (
                    <Badge tone="green">
                      <BadgeCheck className="size-3" /> Implemented
                    </Badge>
                  ) : (
                    <Badge tone="outline">Configured only</Badge>
                  )}
                </Td>
                <Td>
                  <StatusBadge status={provider.enabled && provider.implemented ? 'active' : 'inactive'} />
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <Panel title="Invoice details" description="Printed on customer invoices and receipts.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name">
            {({ id }) => (
              <Input
                id={id}
                value={form.invoice.companyName}
                onChange={(event) => update('invoice', { ...form.invoice, companyName: event.target.value })}
                disabled={readOnly}
              />
            )}
          </Field>
          <Field label="Tax identification number (TIN)">
            {({ id }) => (
              <Input
                id={id}
                value={form.invoice.tin}
                onChange={(event) => update('invoice', { ...form.invoice, tin: event.target.value })}
                disabled={readOnly}
              />
            )}
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Address">
            {({ id }) => (
              <Input
                id={id}
                value={form.invoice.address}
                onChange={(event) => update('invoice', { ...form.invoice, address: event.target.value })}
                disabled={readOnly}
              />
            )}
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Footer note">
            {({ id }) => (
              <Textarea
                id={id}
                value={form.invoice.footerNote}
                onChange={(event) => update('invoice', { ...form.invoice, footerNote: event.target.value })}
                rows={2}
                maxLength={300}
                disabled={readOnly}
              />
            )}
          </Field>
        </div>
      </Panel>

      <p className="flex items-center gap-2 text-[11.5px] text-slate-warm">
        <ShieldCheck className="size-3.5" /> Payment secrets are read from server environment variables and are never
        sent to the browser.
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- Content */

function ContentTab({ canWrite }: { canWrite: boolean }) {
  const { data, isLoading, isError, error, refetch } = useAdminContent();
  const [editing, setEditing] = useState<AdminContentPage | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AdminContentPage | null>(null);
  const invalidate = useAdminInvalidate();

  async function remove() {
    if (!deleting) return;
    try {
      await api.delete(`/admin/content/${deleting.id}`);
      toast('Page deleted');
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
          Policy and informational pages rendered at <span className="font-mono text-[12px]">/pages/&lt;slug&gt;</span>.
        </p>
        {canWrite && (
          <Button iconLeft={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            New page
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
        <AdminLoading label="Loading content pages…" />
      ) : !data.pages.length ? (
        <div className="surface">
          <EmptyState
            icon={<FileText className="size-6" />}
            title="No content pages yet"
            description="Publish shipping, returns, privacy and other policy pages so the footer has somewhere to link."
            action={
              canWrite ? (
                <Button iconLeft={<Plus className="size-4" />} onClick={() => setEditing('new')}>
                  New page
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <DataTable className="min-w-[720px]">
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data.pages.length === 0 ? (
              <TableEmpty colSpan={5}>No pages yet.</TableEmpty>
            ) : (
              data.pages.map((page) => (
                <tr key={page.id} className="transition hover:bg-cream/50">
                  <Td className="font-semibold text-brand-900">{page.title}</Td>
                  <Td className="font-mono text-[12px] text-slate-warm">/{page.slug}</Td>
                  <Td>
                    <StatusBadge status={page.isPublished ? 'active' : 'draft'} />
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {formatDateTime(page.updatedAt)}
                  </Td>
                  <Td align="right">
                    {canWrite ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          iconLeft={<PencilLine className="size-3.5" />}
                          onClick={() => setEditing(page)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleting(page)}
                          aria-label={`Delete ${page.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[11.5px] text-slate-warm">Read only</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </DataTable>
      )}

      {editing && (
        <ContentEditor page={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete content page"
        confirmLabel="Delete page"
        destructive
        description={`Delete “${deleting?.title ?? ''}”? Any footer links to this page will break.`}
      />
    </div>
  );
}

function ContentEditor({ page, onClose }: { page: AdminContentPage | null; onClose: () => void }) {
  const [slug, setSlug] = useState(page?.slug ?? '');
  const [title, setTitle] = useState(page?.title ?? '');
  const [bodyMd, setBodyMd] = useState(page?.bodyMd ?? '');
  const [metaTitle, setMetaTitle] = useState(page?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(page?.metaDescription ?? '');
  const [isPublished, setIsPublished] = useState(page?.isPublished ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())) {
      nextErrors.slug = 'Use lowercase letters, numbers and hyphens.';
    }
    if (title.trim().length < 2) nextErrors.title = 'Give the page a title.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const payload = {
      slug: slug.trim(),
      title: title.trim(),
      bodyMd,
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      isPublished,
    };

    setSaving(true);
    setError(null);
    try {
      if (page) await api.patch(`/admin/content/${page.id}`, payload);
      else await api.post('/admin/content', payload);
      toast(page ? 'Page updated' : 'Page created');
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
    <Modal open onClose={onClose} title={page ? 'Edit content page' : 'New content page'} size="lg">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" error={errors.title}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                invalid={Boolean(errors.title)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Slug" error={errors.slug} hint="Public URL: /pages/your-slug">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="shipping-policy"
                invalid={Boolean(errors.slug)}
              />
            )}
          </Field>
        </div>

        <Field label="Body" hint="Markdown supported.">
          {({ id }) => (
            <Textarea
              id={id}
              value={bodyMd}
              onChange={(event) => setBodyMd(event.target.value)}
              rows={12}
              className="font-mono text-[12.5px]"
              placeholder={'## Delivery\n\nOrders are dispatched within 1–2 business days…'}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meta title">
            {({ id }) => (
              <Input id={id} value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} maxLength={160} />
            )}
          </Field>
          <Field label="Meta description">
            {({ id }) => (
              <Input
                id={id}
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                maxLength={320}
              />
            )}
          </Field>
        </div>

        <Field label="Visibility">
          {({ id }) => (
            <Select id={id} value={isPublished ? 'published' : 'draft'} onChange={(event) => setIsPublished(event.target.value === 'published')}>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </Select>
          )}
        </Field>

        {error && <ErrorNotice message={error} />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {page ? 'Save page' : 'Create page'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
