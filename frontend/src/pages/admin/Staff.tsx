import { useEffect, useMemo, useState } from 'react';
import { KeyRound, PencilLine, Plus, ShieldCheck, UserCog } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  DataTable,
  ErrorNotice,
  Panel,
  SearchField,
  SelectField,
  StatusBadge,
  TableEmpty,
  Td,
  Th,
  humanize,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Field, Input, Modal, Pagination, Select } from '@/components/ui';
import {
  useAdminInvalidate,
  useAdminRoles,
  useAdminStaff,
} from '@/lib/admin';
import type { AdminRole, AdminStaff } from '@/lib/admin';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAuth } from '@/stores/auth';
import { toast } from '@/stores/toasts';

export default function AdminStaffPage() {
  const user = useAuth((state) => state.user);
  const canWrite = Boolean(user?.permissions.includes('staff.write'));
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminStaff | 'new' | null>(null);
  const [resetting, setResetting] = useState<AdminStaff | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({ q: debounced || undefined, status, page, pageSize: 25 }),
    [debounced, status, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminStaff(query);
  const roles = useAdminRoles();

  const roleMap = useMemo(() => {
    const map = new Map<string, AdminRole>();
    for (const role of roles.data?.roles ?? []) map.set(role.key, role);
    return map;
  }, [roles.data]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Administration"
        title="Staff & roles"
        description="Staff accounts and the roles that grant admin permissions. Permissions are enforced by every API endpoint and by database row-level security."
        actions={
          canWrite ? (
            <Button iconLeft={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              Add staff member
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField value={search} onChange={setSearch} placeholder="Name or email" className="w-full sm:w-72" />
        <SelectField
          label="Status"
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All staff' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
        <span className="ml-auto text-xs text-slate-warm">
          {data ? `${data.pagination.total} staff accounts` : ' '}
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
        <AdminLoading label="Loading staff…" />
      ) : !data.staff.length ? (
        <div className="surface">
          <EmptyState
            icon={<UserCog className="size-6" />}
            title="No staff accounts in this view"
            description="Add a staff member and assign one or more roles to give them dashboard access."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Staff member</Th>
                <Th>Roles</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th>Last login</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((member) => (
                <tr key={member.id} className="transition hover:bg-cream/50">
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-brand-900">{member.fullName}</span>
                      {member.id === user?.id && <Badge tone="gold">You</Badge>}
                    </div>
                    <p className="text-[11.5px] text-slate-warm">
                      {member.email}
                      {member.phone ? ` · ${member.phone}` : ''}
                    </p>
                  </Td>
                  <Td>
                    <div className="flex max-w-[260px] flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <Badge key={role} tone={role === 'super_admin' ? 'brand' : 'outline'}>
                          {roleMap.get(role)?.name ?? humanize(role)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <StatusBadge status={member.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">{formatDate(member.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-[12px] text-slate-warm">
                    {member.lastLoginAt ? formatDateTime(member.lastLoginAt) : 'Never'}
                  </Td>
                  <Td align="right">
                    {canWrite ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          iconLeft={<PencilLine className="size-3.5" />}
                          onClick={() => setEditing(member)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft={<KeyRound className="size-3.5" />}
                          onClick={() => setResetting(member)}
                        >
                          Password
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
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onChange={setPage} />
        </div>
      )}

      <Panel
        className="mt-6"
        title="Role reference"
        description="Roles bundle the permissions checked by the API and database policies."
      >
        {roles.isLoading ? (
          <p className="text-sm text-slate-warm">Loading roles…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(roles.data?.roles ?? [])
              .filter((role) => role.isStaff)
              .map((role) => (
                <div key={role.key} className="rounded-xl border border-line/70 bg-cream/40 p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="size-4 text-gold-700" />
                    <p className="font-display text-[13.5px] font-bold text-brand-900">{role.name}</p>
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-slate-warm">{role.description}</p>
                  <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-warm">
                    {role.permissions.length} permissions
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.permissions.slice(0, 6).map((permission) => (
                      <span
                        key={permission}
                        className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-warm"
                      >
                        {permission}
                      </span>
                    ))}
                    {role.permissions.length > 6 && (
                      <span className="px-1 py-0.5 text-[10px] text-slate-warm">
                        +{role.permissions.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </Panel>

      {editing && (
        <StaffEditor
          member={editing === 'new' ? null : editing}
          roles={roles.data?.roles ?? []}
          onClose={() => setEditing(null)}
        />
      )}

      {resetting && <PasswordReset member={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function StaffEditor({
  member,
  roles,
  onClose,
}: {
  member: AdminStaff | null;
  roles: AdminRole[];
  onClose: () => void;
}) {
  const user = useAuth((state) => state.user);
  const isSuper = Boolean(user?.roles.includes('super_admin'));
  const staffRoles = roles.filter((role) => role.isStaff && (isSuper || role.key !== 'super_admin'));
  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(member?.status === 'suspended' ? 'suspended' : 'active');
  const [selected, setSelected] = useState<string[]>(member?.roles ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const invalidate = useAdminInvalidate();

  const toggle = (key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
    setErrors((current) => ({ ...current, roles: '' }));
  };

  async function save() {
    const nextErrors: Record<string, string> = {};
    if (fullName.trim().length < 2) nextErrors.fullName = 'Enter the staff member’s name.';
    if (!member && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }
    if (!member && password.length < 10) nextErrors.password = 'Use at least 10 characters.';
    if (!member && password && (!/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      nextErrors.password = 'Include at least one letter and one number.';
    }
    if (!selected.length) nextErrors.roles = 'Choose at least one role.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setError(null);
    try {
      if (member) {
        await api.patch(`/admin/staff/${member.id}`, {
          fullName: fullName.trim(),
          phone: phone.trim(),
          status,
          roles: selected,
        });
        toast('Staff member updated');
      } else {
        await api.post('/admin/staff', {
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          phone: phone.trim() || undefined,
          roles: selected,
        });
        toast('Staff member created');
      }
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
    <Modal open onClose={onClose} title={member ? 'Edit staff member' : 'Add staff member'} size="lg">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.fullName}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                invalid={Boolean(errors.fullName)}
                autoFocus
              />
            )}
          </Field>
          <Field label="Email" error={errors.email} hint={member ? 'Email cannot be changed.' : undefined}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={Boolean(member)}
                invalid={Boolean(errors.email)}
              />
            )}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone number" error={errors.phone}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+251 …"
                invalid={Boolean(errors.phone)}
              />
            )}
          </Field>
          {member ? (
            <Field label="Account status">
              {({ id }) => (
                <Select id={id} value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </Select>
              )}
            </Field>
          ) : (
            <Field
              label="Temporary password"
              error={errors.password}
              hint="At least 10 characters with a letter and a number. Share it securely."
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  invalid={Boolean(errors.password)}
                />
              )}
            </Field>
          )}
        </div>

        <div>
          <p className="label">Roles</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {staffRoles.map((role) => {
              const checked = selected.includes(role.key);
              return (
                <button
                  key={role.key}
                  type="button"
                  onClick={() => toggle(role.key)}
                  className={
                    checked
                      ? 'rounded-xl border border-brand-900 bg-brand-50/70 p-3 text-left'
                      : 'rounded-xl border border-line bg-white p-3 text-left transition hover:border-brand-900/30'
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-brand-900">{role.name}</span>
                    <span
                      className={
                        checked
                          ? 'grid size-4 place-items-center rounded border border-brand-900 bg-brand-900 text-[10px] text-white'
                          : 'size-4 rounded border border-line'
                      }
                      aria-hidden
                    >
                      {checked ? '✓' : ''}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-slate-warm">{role.description}</span>
                </button>
              );
            })}
          </div>
          {errors.roles && <p className="mt-1.5 text-xs font-medium text-red-600">{errors.roles}</p>}
        </div>

        {member && member.id === user?.id && (
          <p className="rounded-lg bg-cream/70 px-3 py-2 text-[11.5px] text-slate-warm">
            You cannot suspend your own account or remove your own super administrator role.
          </p>
        )}

        {error && <ErrorNotice message={error} />}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            {member ? 'Save changes' : 'Create staff member'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PasswordReset({ member, onClose }: { member: AdminStaff; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function save() {
    if (password.length < 10) {
      setFieldError('Use at least 10 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setFieldError('Include at least one letter and one number.');
      return;
    }
    setFieldError(null);
    setSaving(true);
    setError(null);
    try {
      await api.post(`/admin/staff/${member.id}/password`, { password });
      toast('Password reset');
      onClose();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Reset password for ${member.fullName}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-warm">
          Existing sessions for this account are revoked. Share the new password through a secure channel.
        </p>
        <Field label="New password" error={fieldError ?? undefined}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          )}
        </Field>
        {error && <ErrorNotice message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            Reset password
          </Button>
        </div>
      </div>
    </Modal>
  );
}
