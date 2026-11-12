import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  DataTable,
  DateRangeFields,
  ErrorNotice,
  SearchField,
  SelectField,
  TableEmpty,
  Td,
  Th,
} from '@/components/admin/ui';
import { Badge, Button, EmptyState, Input, Pagination } from '@/components/ui';
import { rangeDays, useAdminAudit } from '@/lib/admin';
import type { AdminAuditEntry } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';

const ENTITY_TYPES = [
  'order',
  'product',
  'variant',
  'category',
  'brand',
  'inventory',
  'supplier',
  'customer',
  'staff',
  'coupon',
  'banner',
  'review',
  'settings',
  'content_page',
  'payment',
  'refund',
  'shipment',
  'newsletter_subscriber',
];

export default function AdminAuditPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [entityType, setEntityType] = useState('all');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [range, setRange] = useState(() => rangeDays(30));
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 300);
    return () => window.clearTimeout(timer);
  }, [action, actor]);

  const query = useMemo(
    () => ({
      q: debounced || undefined,
      entityType: entityType === 'all' ? undefined : entityType,
      action: action.trim() || undefined,
      actor: actor.trim() || undefined,
      from: range.from,
      to: range.to,
      page,
      pageSize: 30,
    }),
    [debounced, entityType, action, actor, range, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminAudit(query);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Insights"
        title="Audit log"
        description="Every privileged change records the actor, entity and before/after values. Entries are immutable and retained for compliance review."
        actions={<DateRangeFields value={range} onChange={(next) => { setRange(next); setPage(1); }} />}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Entity, action or actor"
          className="w-full sm:w-72"
        />
        <SelectField
          label="Entity"
          value={entityType}
          onChange={(next) => {
            setEntityType(next);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All entities' },
            ...ENTITY_TYPES.map((value) => ({ value, label: value.replace(/_/g, ' ') })),
          ]}
        />
        <Input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="Action contains…"
          className="h-10 w-40 text-[13px]"
          aria-label="Action filter"
        />
        <Input
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          placeholder="Actor email"
          className="h-10 w-48 text-[13px]"
          aria-label="Actor filter"
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
        <AdminLoading label="Loading audit entries…" />
      ) : !data.entries.length ? (
        <div className="surface">
          <EmptyState
            icon={<ScrollText className="size-6" />}
            title="No audit entries in this view"
            description="Adjust the date range, entity or actor filters. Privileged admin changes will be listed here."
          />
        </div>
      ) : (
        <div className="space-y-4">
          <DataTable className="min-w-[960px]">
            <thead>
              <tr>
                <Th className="w-8" />
                <Th>When</Th>
                <Th>Actor</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry) => (
                <AuditRow
                  key={entry.id}
                  entry={entry}
                  open={expanded === entry.id}
                  onToggle={() => setExpanded((current) => (current === entry.id ? null : entry.id))}
                />
              ))}
            </tbody>
          </DataTable>
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function AuditRow({
  entry,
  open,
  onToggle,
}: {
  entry: AdminAuditEntry;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer transition hover:bg-cream/50"
        onClick={onToggle}
        aria-expanded={open}
      >
        <Td>
          {open ? (
            <ChevronDown className="size-4 text-brand-900" aria-hidden />
          ) : (
            <ChevronRight className="size-4 text-slate-warm" aria-hidden />
          )}
        </Td>
        <Td className="whitespace-nowrap text-[12px] text-slate-warm">{formatDateTime(entry.createdAt)}</Td>
        <Td className="text-[12.5px]">{entry.actorEmail ?? 'system'}</Td>
        <Td>
          <span className="font-mono text-[12px] font-semibold text-brand-900">{entry.action}</span>
        </Td>
        <Td>
          <span className="text-[12.5px] capitalize">{entry.entityType.replace(/_/g, ' ')}</span>
          {entry.entityId && (
            <p className="max-w-[180px] truncate font-mono text-[10.5px] text-slate-warm">{entry.entityId}</p>
          )}
        </Td>
        <Td className="font-mono text-[11px] text-slate-warm">{entry.ip ?? '—'}</Td>
      </tr>
      {open && (
        <tr className="bg-cream/30">
          <td colSpan={6} className="border-b border-line/60 px-4 py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-slate-warm">
                  Before <Badge tone="outline">state</Badge>
                </p>
                <JsonValue value={entry.before} />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.13em] text-slate-warm">
                  After <Badge tone="outline">state</Badge>
                </p>
                <JsonValue value={entry.after} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-slate-warm">No data captured.</p>;
  }
  return (
    <pre className="max-h-60 overflow-auto rounded-lg border border-line/70 bg-white p-3 font-mono text-[11px] leading-relaxed text-ink/80">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
