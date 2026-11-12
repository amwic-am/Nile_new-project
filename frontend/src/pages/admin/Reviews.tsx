import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareText, ShieldCheck, Trash2 } from 'lucide-react';
import {
  AdminLoading,
  AdminPageHeader,
  AdminTabs,
  ConfirmDialog,
  ErrorNotice,
  SearchField,
  SelectField,
  StatusBadge,
} from '@/components/admin/ui';
import { Button, EmptyState, Field, Modal, Pagination, Stars, Textarea } from '@/components/ui';
import { useAdminInvalidate, useAdminReviews } from '@/lib/admin';
import type { AdminReview } from '@/lib/admin';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { toast } from '@/stores/toasts';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function AdminReviewsPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rating, setRating] = useState('all');
  const [page, setPage] = useState(1);
  const [replying, setReplying] = useState<AdminReview | null>(null);
  const [deleting, setDeleting] = useState<AdminReview | null>(null);
  const invalidate = useAdminInvalidate();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = useMemo(
    () => ({
      q: debounced || undefined,
      status,
      rating: rating === 'all' ? undefined : Number(rating),
      page,
      pageSize: 20,
    }),
    [debounced, status, rating, page],
  );
  const { data, isLoading, isError, error, refetch } = useAdminReviews(query);

  async function setReviewStatus(review: AdminReview, next: 'approved' | 'rejected' | 'pending') {
    try {
      await api.patch(`/admin/reviews/${review.id}`, { status: next });
      toast(`Review ${next}`);
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  async function remove() {
    if (!deleting) return;
    try {
      await api.delete(`/admin/reviews/${deleting.id}`);
      toast('Review deleted');
      setDeleting(null);
      void invalidate();
    } catch (mutationError) {
      toast(errorMessage(mutationError), 'error');
    }
  }

  return (
    <div>
      <AdminPageHeader
        eyebrow="Marketing"
        title="Reviews"
        description="Moderate customer reviews before they appear on product pages. Approving or removing a review recalculates the product rating."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminTabs
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          tabs={[
            { key: 'pending', label: 'Pending', count: data?.counts.pending ?? 0 },
            { key: 'approved', label: 'Approved', count: data?.counts.approved ?? 0 },
            { key: 'rejected', label: 'Rejected', count: data?.counts.rejected ?? 0 },
            { key: 'all', label: 'All' },
          ]}
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Product, customer or review text"
          className="w-full sm:w-80"
        />
        <SelectField
          label="Rating"
          value={rating}
          onChange={(next) => {
            setRating(next);
            setPage(1);
          }}
          options={[
            { value: 'all', label: 'All ratings' },
            { value: '5', label: '5 stars' },
            { value: '4', label: '4 stars' },
            { value: '3', label: '3 stars' },
            { value: '2', label: '2 stars' },
            { value: '1', label: '1 star' },
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
        <AdminLoading label="Loading reviews…" />
      ) : !data.reviews.length ? (
        <div className="surface">
          <EmptyState
            icon={<ShieldCheck className="size-6" />}
            title={status === 'pending' ? 'Nothing waiting for moderation' : 'No reviews in this view'}
            description={
              status === 'pending'
                ? 'New reviews will appear here for approval before they go live.'
                : 'Try a different status, rating or search term.'
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {data.reviews.map((review) => (
            <article key={review.id} className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={review.rating} size={14} label={false} />
                    <StatusBadge status={review.status} />
                    {review.orderNumber && (
                      <span className="text-[11px] text-slate-warm">Verified purchase · {review.orderNumber}</span>
                    )}
                  </div>
                  <h3 className="mt-1.5 font-display text-[15px] font-bold text-brand-900">{review.title}</h3>
                  <p className="mt-1 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-ink/80">
                    {review.body}
                  </p>
                  <p className="mt-2 text-[11.5px] text-slate-warm">
                    {review.customer.name} · {review.customer.email} · {formatDateTime(review.createdAt)}
                  </p>
                  <p className="text-[11.5px] text-slate-warm">
                    On{' '}
                    <Link
                      to={`/product/${review.productSlug}`}
                      className="font-semibold text-brand-900 underline decoration-gold-400 underline-offset-2"
                    >
                      {review.productName}
                    </Link>
                  </p>
                  {review.adminReply && (
                    <div className="mt-3 rounded-xl border border-line bg-cream/60 p-3 text-[12.5px] leading-relaxed">
                      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-warm">
                        Store reply
                      </p>
                      {review.adminReply}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {review.status !== 'approved' && (
                    <Button size="sm" onClick={() => void setReviewStatus(review, 'approved')}>
                      Approve
                    </Button>
                  )}
                  {review.status !== 'rejected' && (
                    <Button variant="outline" size="sm" onClick={() => void setReviewStatus(review, 'rejected')}>
                      Reject
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft={<MessageSquareText className="size-3.5" />}
                    onClick={() => setReplying(review)}
                  >
                    Reply
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => setDeleting(review)}
                    aria-label="Delete review"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
          <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onChange={setPage} />
        </div>
      )}

      {replying && (
        <ReplyModal
          review={replying}
          onClose={() => setReplying(null)}
          onSaved={() => {
            setReplying(null);
            void invalidate();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete review"
        confirmLabel="Delete review"
        destructive
        description="This permanently removes the review and recalculates the product rating. Rejecting keeps it on record instead."
      />
    </div>
  );
}

function ReplyModal({
  review,
  onClose,
  onSaved,
}: {
  review: AdminReview;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reply, setReply] = useState(review.adminReply ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/admin/reviews/${review.id}`, { adminReply: reply.trim() || null });
      toast(reply.trim() ? 'Reply saved' : 'Reply removed');
      onSaved();
    } catch (mutationError) {
      setError(errorMessage(mutationError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Reply to review">
      <div className="space-y-4">
        <div className="rounded-xl bg-cream/60 p-3 text-[12.5px] text-ink/80">
          <p className="font-semibold text-brand-900">{review.title}</p>
          <p className="mt-1 line-clamp-3">{review.body}</p>
        </div>
        <Field label="Store reply" hint="Shown publicly beneath the review. Clear it to remove the reply.">
          {({ id }) => (
            <Textarea
              id={id}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Thank you for the feedback…"
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
            Save reply
          </Button>
        </div>
      </div>
    </Modal>
  );
}
