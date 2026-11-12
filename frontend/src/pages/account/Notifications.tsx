import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  CreditCard,
  Package,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { Button, EmptyState, Pagination, Skeleton } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { cx, relativeDate } from '@/lib/format';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '@/lib/queries';
import { useSeo } from '@/lib/seo';
import { useToasts } from '@/stores/toasts';
import type { AccountNotification } from '@/lib/types';

type Filter = 'all' | 'unread';

function NotificationIcon({ type }: { type: string }) {
  const icon =
    type.startsWith('order') ? (
      <Package className="size-4" />
    ) : type.startsWith('payment') ? (
      <CreditCard className="size-4" />
    ) : type === 'low_stock' ? (
      <TriangleAlert className="size-4" />
    ) : type === 'welcome' || type === 'account' ? (
      <ShieldCheck className="size-4" />
    ) : type === 'promotion' ? (
      <Sparkles className="size-4" />
    ) : (
      <Bell className="size-4" />
    );
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-900">
      {icon}
    </span>
  );
}

export default function AccountNotificationsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useNotifications(page, filter);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const push = useToasts((state) => state.push);

  useSeo({
    title: 'Notifications',
    description: 'Order, payment and account notifications from Nile Mart.',
    canonicalPath: '/account/notifications',
    noIndex: true,
  });

  const changeFilter = (next: Filter) => {
    setFilter(next);
    setPage(1);
  };

  const handleOpen = (notification: AccountNotification) => {
    if (!notification.isRead) markRead.mutate(notification.id);
  };

  const handleRead = (notification: AccountNotification) => {
    markRead.mutate(notification.id, {
      onError: (caught) => push(errorMessage(caught), 'error'),
    });
  };

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => push('All notifications marked as read.'),
      onError: (caught) => push(errorMessage(caught), 'error'),
    });
  };

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-900">Notifications</h2>
            <p className="mt-0.5 text-[12px] text-slate-warm">
              Order updates, payment confirmations and account alerts.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            iconLeft={<CheckCheck className="size-3.5" />}
            disabled={unreadCount === 0 || markAll.isPending}
            loading={markAll.isPending}
            onClick={handleMarkAll}
          >
            Mark all read
          </Button>
        </div>

        <div className="mt-4 flex gap-1 rounded-xl bg-cream p-1">
          {(['all', 'unread'] as Filter[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => changeFilter(item)}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3.5 py-2 text-[12px] font-semibold capitalize transition',
                filter === item ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-warm hover:text-brand-900',
              )}
            >
              {item === 'all' ? 'All' : 'Unread'}
              {item === 'unread' && unreadCount > 0 && (
                <span className="grid min-w-5 place-items-center rounded-full bg-gold-500 px-1.5 py-0.5 text-[10px] font-bold text-brand-950">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="surface divide-y divide-line/70">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex gap-3 p-4">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError || !data ? (
        <div className="surface">
          <EmptyState
            icon={<Bell className="size-6" />}
            title="We could not load your notifications"
            description={errorMessage(error)}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        </div>
      ) : data.notifications.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<Bell className="size-6" />}
            title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
            description={
              filter === 'unread'
                ? 'There are no unread notifications right now.'
                : 'Order updates and account alerts will appear here.'
            }
            action={
              filter === 'unread' ? (
                <Button variant="outline" onClick={() => changeFilter('all')}>
                  View all notifications
                </Button>
              ) : (
                <Link
                  to="/products"
                  className="text-[12px] font-bold text-brand-900 underline underline-offset-4"
                >
                  Browse products
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="surface overflow-hidden">
            {data.notifications.map((notification) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={cx(
                        'text-[12.5px] text-brand-900',
                        notification.isRead ? 'font-semibold' : 'font-bold',
                      )}
                    >
                      {notification.title}
                    </p>
                    <span className="shrink-0 text-[10.5px] text-slate-warm">
                      {relativeDate(notification.createdAt)}
                    </span>
                  </div>
                  {notification.body && (
                    <p className="mt-1 text-[11.5px] leading-relaxed text-slate-warm">{notification.body}</p>
                  )}
                </>
              );

              return (
                <article
                  key={notification.id}
                  className={cx(
                    'flex gap-3 border-b border-line/70 p-4 last:border-0',
                    !notification.isRead && 'bg-gold-50/40',
                  )}
                >
                  <NotificationIcon type={notification.type} />
                  <div className="min-w-0 flex-1">
                    {notification.link ? (
                      <Link to={notification.link} onClick={() => handleOpen(notification)} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                    {!notification.isRead && (
                      <button
                        type="button"
                        onClick={() => handleRead(notification)}
                        className="mt-1.5 text-[10.5px] font-bold text-brand-900 underline decoration-gold-400 underline-offset-2"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                  {!notification.isRead && (
                    <span className="mt-1 size-2 shrink-0 rounded-full bg-gold-500" aria-label="Unread" />
                  )}
                </article>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11.5px] text-slate-warm">
              {data.pagination.total} {data.pagination.total === 1 ? 'notification' : 'notifications'}
            </p>
            <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
