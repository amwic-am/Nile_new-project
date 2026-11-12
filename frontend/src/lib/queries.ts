import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import type {
  AccountReviewPage,
  AccountSummary,
  Address,
  AuthUser,
  CartView,
  CheckoutOverview,
  HomeData,
  NotificationPage,
  OrderDetail,
  OrderSummary,
  PlacedOrder,
  ProductCardData,
  ProductDetail,
  ProductListResult,
  ReviewPage,
  SessionInfo,
  SiteSettings,
} from '@/lib/types';

export const queryKeys = {
  site: ['site'] as const,
  home: ['home'] as const,
  products: (params: Record<string, unknown>) => ['products', params] as const,
  product: (slug: string) => ['product', slug] as const,
  reviews: (slug: string, page: number, rating?: number) => ['reviews', slug, page, rating ?? 0] as const,
  cart: ['cart'] as const,
  wishlist: ['wishlist'] as const,
  checkout: ['checkout'] as const,
  orders: (page: number, status = 'all', q = '') => ['orders', page, status, q] as const,
  order: (id: string) => ['order', id] as const,
  accountSummary: ['account', 'summary'] as const,
  addresses: ['account', 'addresses'] as const,
  notifications: (page: number, filter: string) => ['account', 'notifications', page, filter] as const,
  accountReviews: (page: number) => ['account', 'reviews', page] as const,
  sessions: ['auth', 'sessions'] as const,
};

export function useSite() {
  return useQuery({
    queryKey: queryKeys.site,
    queryFn: () => api.get<SiteSettings & { integrations: { chapa: boolean; cod: boolean } }>('/site'),
    staleTime: 5 * 60_000,
  });
}

export function useHome() {
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => api.get<HomeData>('/home'),
    staleTime: 60_000,
  });
}

export interface ProductQuery {
  q?: string;
  category?: string;
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  colors?: string[];
  sizes?: string[];
  deals?: boolean;
  featured?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useProducts(query: ProductQuery) {
  const search = {
    q: query.q,
    category: query.category,
    brand: query.brand?.join(',') || undefined,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
    rating: query.rating,
    inStock: query.inStock ? 'true' : undefined,
    colors: query.colors?.join(',') || undefined,
    sizes: query.sizes?.join(',') || undefined,
    deals: query.deals ? 'true' : undefined,
    featured: query.featured ? 'true' : undefined,
    sort: query.sort,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 24,
  };
  return useQuery({
    queryKey: queryKeys.products(search),
    queryFn: () => api.get<ProductListResult>('/products', search),
    placeholderData: (previous) => previous,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: queryKeys.product(slug),
    queryFn: () => api.get<{ product: ProductDetail }>(`/products/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug),
  });
}

export function useReviews(slug: string, page: number, rating?: number) {
  return useQuery({
    queryKey: queryKeys.reviews(slug, page, rating),
    queryFn: () => api.get<ReviewPage>(`/products/${encodeURIComponent(slug)}/reviews`, { page, rating }),
    enabled: Boolean(slug),
  });
}

export function useCart() {
  return useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.get<{ cart: CartView }>('/cart'),
    staleTime: 15_000,
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { variantId: string; quantity?: number }) =>
      api.post<{ cart: CartView }>('/cart/items', { variantId: input.variantId, quantity: input.quantity ?? 1 }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cart, data);
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { cartItemId: string; quantity: number }) =>
      api.patch<{ cart: CartView }>(`/cart/items/${input.cartItemId}`, { quantity: input.quantity }),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.cart, data),
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cartItemId: string) => api.delete<{ cart: CartView }>(`/cart/items/${cartItemId}`),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.cart, data),
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ cart: CartView }>('/cart'),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.cart, data),
  });
}

export function useApplyCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ cart: CartView }>('/cart/coupon', { code }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cart, data);
      queryClient.invalidateQueries({ queryKey: queryKeys.checkout });
    },
  });
}

export function useRemoveCoupon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ cart: CartView }>('/cart/coupon'),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.cart, data);
      queryClient.invalidateQueries({ queryKey: queryKeys.checkout });
    },
  });
}

export function useCheckoutOverview(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.checkout,
    queryFn: () => api.get<CheckoutOverview>('/checkout'),
    enabled,
    staleTime: 0,
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; body: Record<string, unknown> }) => {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.key },
        body: JSON.stringify(input.body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const error = payload?.error;
        throw new ApiError(
          response.status,
          error?.code ?? 'checkout_failed',
          error?.message ?? 'We could not place your order. Please try again.',
          error?.details,
        );
      }
      return payload as {
        order: PlacedOrder;
        payment: { redirectUrl?: string | null; checkoutUrl?: string | null } | null;
        paymentError: { code: string; message: string } | null;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accountSummary });
    },
  });
}

export type OrderStatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

export function useOrders(
  page: number,
  filters: { status?: OrderStatusFilter; q?: string } = {},
) {
  const status = filters.status ?? 'all';
  const q = filters.q?.trim() ?? '';
  return useQuery({
    queryKey: queryKeys.orders(page, status, q),
    queryFn: () =>
      api.get<{
        orders: OrderSummary[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>('/orders', { page, status, q }),
    placeholderData: (previous) => previous,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => api.get<{ order: OrderDetail }>(`/orders/${encodeURIComponent(id)}`),
    enabled: Boolean(id),
  });
}

export function useRecentlyViewedCards(ids: string[]) {
  return useQuery({
    queryKey: ['recently-viewed-cards', ids.join(',')],
    queryFn: () => api.get<{ products: ProductCardData[] }>('/products/by-ids', { ids: ids.join(',') }),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: AuthUser | null }>('/auth/me'),
    staleTime: 60_000,
  });
}

export interface ContentPageData {
  slug: string;
  title: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

export function useContentPage(slug: string) {
  return useQuery({
    queryKey: ['content', slug],
    queryFn: () => api.get<{ page: ContentPageData }>(`/content/${encodeURIComponent(slug)}`),
    enabled: Boolean(slug),
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ categories: import('@/lib/types').CategoryNode[] }>('/categories'),
    staleTime: 10 * 60_000,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: ['brands'],
    queryFn: () => api.get<{ brands: import('@/lib/types').Brand[] }>('/brands'),
    staleTime: 10 * 60_000,
  });
}

/* ------------------------------------------------------------------ Account */

export function useAccountSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.accountSummary,
    queryFn: () => api.get<AccountSummary>('/account/summary'),
    enabled,
    staleTime: 30_000,
  });
}

export interface ProfileInput {
  fullName: string;
  phone: string | null;
  marketingOptIn: boolean;
  notificationPrefs?: Record<string, boolean>;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProfileInput) =>
      api.patch<{ user: AuthUser; message: string }>('/account/profile', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accountSummary });
    },
  });
}

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => api.get<{ addresses: Address[] }>('/account/addresses'),
    enabled,
  });
}

export interface AddressInput {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
}

function useInvalidateAddresses() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
    queryClient.invalidateQueries({ queryKey: queryKeys.accountSummary });
    queryClient.invalidateQueries({ queryKey: queryKeys.checkout });
  };
}

export function useCreateAddress() {
  const invalidate = useInvalidateAddresses();
  return useMutation({
    mutationFn: (input: AddressInput) =>
      api.post<{ address: Address; message: string }>('/account/addresses', input),
    onSuccess: invalidate,
  });
}

export function useUpdateAddress() {
  const invalidate = useInvalidateAddresses();
  return useMutation({
    mutationFn: (input: { id: string; data: AddressInput }) =>
      api.patch<{ address: Address; message: string }>(`/account/addresses/${input.id}`, input.data),
    onSuccess: invalidate,
  });
}

export function useDeleteAddress() {
  const invalidate = useInvalidateAddresses();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean; message: string }>(`/account/addresses/${id}`),
    onSuccess: invalidate,
  });
}

export function useNotifications(page: number, filter: 'all' | 'unread') {
  return useQuery({
    queryKey: queryKeys.notifications(page, filter),
    queryFn: () => api.get<NotificationPage>('/account/notifications', { page, filter }),
    placeholderData: (previous) => previous,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; unreadCount: number }>(`/account/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accountSummary });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ ok: boolean; marked: number; unreadCount: number }>('/account/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.accountSummary });
    },
  });
}

export function useAccountReviews(page: number) {
  return useQuery({
    queryKey: queryKeys.accountReviews(page),
    queryFn: () => api.get<AccountReviewPage>('/account/reviews', { page }),
    placeholderData: (previous) => previous,
  });
}

export function useSessions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: () => api.get<{ sessions: SessionInfo[] }>('/auth/sessions'),
    enabled,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: boolean }>(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
}
