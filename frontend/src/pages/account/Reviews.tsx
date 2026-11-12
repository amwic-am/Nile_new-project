import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareQuote, Star } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, Pagination, Skeleton, Stars } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAccountReviews } from '@/lib/queries';
import { useSeo } from '@/lib/seo';

const STATUS_TONE: Record<string, 'green' | 'gold' | 'red'> = {
  approved: 'green',
  pending: 'gold',
  rejected: 'red',
};

export default function AccountReviewsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useAccountReviews(page);

  useSeo({
    title: 'Your reviews',
    description: 'Reviews you have written for Nile Mart purchases.',
    canonicalPath: '/account/reviews',
    noIndex: true,
  });

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <h2 className="font-display text-lg font-bold text-brand-900">Your reviews</h2>
        <p className="mt-0.5 text-[12px] text-slate-warm">
          Share your experience to help other shoppers choose well.
        </p>
        {data && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full bg-cream px-3 py-1 text-[11px] font-semibold text-slate-warm">
              {data.counts.total} total
            </span>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              {data.counts.approved} published
            </span>
            {data.counts.pending > 0 && (
              <span className="rounded-full bg-gold-50 px-3 py-1 text-[11px] font-semibold text-gold-800">
                {data.counts.pending} awaiting moderation
              </span>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((item) => (
            <Skeleton key={item} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <div className="surface">
          <EmptyState
            icon={<Star className="size-6" />}
            title="We could not load your reviews"
            description={errorMessage(error)}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-[12px] font-bold text-brand-900 underline underline-offset-4"
              >
                Try again
              </button>
            }
          />
        </div>
      ) : (
        <>
          {data.pending.length > 0 && (
            <section className="surface p-5">
              <h3 className="flex items-center gap-2 font-display text-base font-bold text-brand-900">
                <Star className="size-4 text-gold-500" /> Waiting for your review
              </h3>
              <p className="mt-0.5 text-[12px] text-slate-warm">
                These delivered purchases have not been reviewed yet.
              </p>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {data.pending.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center gap-3 rounded-xl border border-line p-3"
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-[12px] font-semibold text-brand-900">{item.name}</p>
                      <p className="text-[10.5px] text-slate-warm">
                        Order {item.orderNumber}
                        {item.deliveredAt ? ` · ${formatDate(item.deliveredAt)}` : ''}
                      </p>
                    </div>
                    <ButtonLink to={`/product/${item.slug}#reviews`} size="sm" variant="outline">
                      Review
                    </ButtonLink>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data.reviews.length === 0 ? (
            <div className="surface">
              <EmptyState
                icon={<MessageSquareQuote className="size-6" />}
                title="No reviews yet"
                description="Once you review a delivered purchase it will appear here."
                action={<ButtonLink to="/account/orders?status=completed">View delivered orders</ButtonLink>}
              />
            </div>
          ) : (
            <div className="space-y-3">
              {data.reviews.map((review) => (
                <article key={review.id} className="surface p-5">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="size-14 shrink-0 overflow-hidden rounded-xl bg-sand">
                      {review.product.imageUrl && (
                        <img
                          src={review.product.imageUrl}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/product/${review.product.slug}`}
                          className="text-[13px] font-bold text-brand-900 hover:text-brand-600"
                        >
                          {review.product.name}
                        </Link>
                        <Badge tone={STATUS_TONE[review.status] ?? 'neutral'}>
                          {review.status === 'approved'
                            ? 'Published'
                            : review.status === 'pending'
                              ? 'In moderation'
                              : 'Not published'}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Stars value={review.rating} size={13} />
                        <span className="text-[11px] text-slate-warm">{formatDate(review.createdAt)}</span>
                      </div>
                      {review.title && (
                        <p className="mt-2 text-[12.5px] font-semibold text-brand-900">{review.title}</p>
                      )}
                      <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-warm">
                        {review.body}
                      </p>
                      {review.adminReply && (
                        <div className="mt-3 rounded-xl border-l-2 border-gold-400 bg-cream/70 px-3.5 py-2.5">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gold-700">
                            Response from Nile Mart
                          </p>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-slate-warm">
                            {review.adminReply}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              <Pagination page={page} totalPages={data.pagination.totalPages} onChange={setPage} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
