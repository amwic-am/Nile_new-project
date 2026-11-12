import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OrderDetail } from '@/lib/types';

/* ------------------------------------------------------------------ Shared */

export interface AdminPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminRange {
  from: string;
  to: string;
}

export type SearchParams = Record<string, string | number | boolean | null | undefined>;

const addisDate = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export function rangeDays(days: number): AdminRange {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86_400_000);
  return { from: addisDate(from), to: addisDate(to) };
}

export function adminCsvUrl(path: string, search: SearchParams = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return `/api/admin/${path}${query ? `?${query}` : ''}`;
}

/* --------------------------------------------------------------- Dashboard */

export interface AdminDashboard {
  range: AdminRange;
  permissions: { orders: boolean; inventory: boolean; customers: boolean; promotions: boolean };
  sales?: {
    revenue: number;
    orders: number;
    units: number;
    averageOrderValue: number;
    awaitingPayment: number;
    pendingFulfilment: number;
    previousRevenue: number;
    previousOrders: number;
    refundsPending: number;
    series: { date: string; orders: number; revenue: number; units: number }[];
    statuses: { status: string; count: number }[];
    payments: { provider: string; amount: number; count: number }[];
    topProducts: {
      productId: string;
      name: string;
      slug: string;
      imageUrl: string | null;
      units: number;
      revenue: number;
    }[];
    recentOrders: {
      id: string;
      orderNumber: string;
      customerName: string;
      status: string;
      paymentStatus: string;
      total: number;
      itemCount: number;
      placedAt: string;
    }[];
  };
  inventory?: {
    variants: number;
    lowStock: number;
    outOfStock: number;
    reserved: number;
    lowStockItems: {
      variantId: string;
      productName: string;
      productSlug: string;
      sku: string;
      variantLabel: string;
      available: number;
      threshold: number;
    }[];
  };
  customers?: { total: number; newInRange: number; previousNew: number; buyers: number };
  promotions?: {
    pendingReviews: number;
    activeCoupons: number;
    subscribers: number;
    activeBanners: number;
  };
}

export function useAdminDashboard(range: AdminRange) {
  return useQuery({
    queryKey: ['admin', 'dashboard', range],
    queryFn: () => api.get<AdminDashboard>('/admin/dashboard', { from: range.from, to: range.to }),
    placeholderData: (previous) => previous,
  });
}

/* ------------------------------------------------------------------ Orders */

export type AdminOrderStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'paid'
  | 'confirmed'
  | 'processing'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'refunded';

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  customerName: string;
  email: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  placedAt: string;
  itemCount: number;
  shipmentStatus: string | null;
}

export interface AdminOrdersResult {
  orders: AdminOrderListItem[];
  counts: Record<string, number>;
  range: AdminRange;
  pagination: AdminPagination;
}

export function useAdminOrders(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'orders', search],
    queryFn: () => api.get<AdminOrdersResult>('/admin/orders', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminOrderPayment {
  id: string;
  provider: string;
  reference: string | null;
  amount: number;
  status: string;
  failureReason: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface AdminShipment {
  id: string;
  carrier: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AdminReturn {
  id: string;
  orderItemId: string | null;
  reason: string;
  description: string;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminRefund {
  id: string;
  amount: number;
  reason: string;
  status: string;
  providerRef: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface AdminOrderDetail extends OrderDetail {
  payments: AdminOrderPayment[];
  shipments: AdminShipment[];
  returns: AdminReturn[];
  refunds: AdminRefund[];
  customer: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: string;
    orderCount: number;
    lifetimeValue: number;
  } | null;
  allowedStatuses: string[];
}

export function useAdminOrder(identifier: string) {
  return useQuery({
    queryKey: ['admin', 'order', identifier],
    queryFn: () => api.get<{ order: AdminOrderDetail }>(`/admin/orders/${encodeURIComponent(identifier)}`),
    enabled: Boolean(identifier),
  });
}

export interface AdminReturnListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  reason: string;
  status: string;
  createdAt: string;
}

export function useAdminReturns(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'returns', search],
    queryFn: () => api.get<{ returns: AdminReturnListItem[]; pagination: AdminPagination }>('/admin/returns', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminRefundListItem {
  id: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
}

export function useAdminRefunds(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'refunds', search],
    queryFn: () => api.get<{ refunds: AdminRefundListItem[]; pagination: AdminPagination }>('/admin/refunds', search),
    placeholderData: (previous) => previous,
  });
}

/* ---------------------------------------------------------------- Products */

export interface AdminProductSummary {
  id: string;
  name: string;
  slug: string;
  sku: string;
  status: string;
  basePrice: number;
  compareAtPrice: number | null;
  isFeatured: boolean;
  soldCount: number;
  updatedAt: string;
  categoryName: string | null;
  brandName: string | null;
  imageUrl: string | null;
  variantCount: number;
  totalStock: number;
  costPrice: number | null;
}

export function useAdminProducts(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'products', search],
    queryFn: () =>
      api.get<{ products: AdminProductSummary[]; pagination: AdminPagination }>('/admin/products', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminProductImage {
  id?: string;
  url: string;
  alt: string;
  position?: number;
}

export interface AdminProductVariant {
  id: string;
  sku: string;
  barcode: string | null;
  optionValues: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
  isActive: boolean;
  position: number;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number | null;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  shortDescription: string;
  description: string;
  categoryId: string | null;
  brandId: string | null;
  basePrice: number;
  compareAtPrice: number | null;
  status: string;
  isFeatured: boolean;
  specs: { label: string; value: string }[];
  warrantyInfo: string;
  returnInfo: string;
  lowStockThreshold: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  costPrice: number | null;
  images: AdminProductImage[];
  options: { id: string; name: string; position: number; values: { id: string; value: string; position: number }[] }[];
  variants: AdminProductVariant[];
  suppliers: { id: string; name: string; costPrice: number | null; leadTimeDays: number | null }[];
}

export function useAdminProduct(id: string) {
  return useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => api.get<{ product: AdminProduct }>(`/admin/products/${id}`),
    enabled: Boolean(id),
  });
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  description: string;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  productCount: number;
}

export function useAdminCategories() {
  return useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: () => api.get<{ categories: AdminCategory[] }>('/admin/categories'),
    staleTime: 60_000,
  });
}

export interface AdminBrand {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  isActive: boolean;
  productCount: number;
}

export function useAdminBrands() {
  return useQuery({
    queryKey: ['admin', 'brands'],
    queryFn: () => api.get<{ brands: AdminBrand[] }>('/admin/brands'),
    staleTime: 60_000,
  });
}

/* --------------------------------------------------------------- Inventory */

export interface AdminInventoryVariant {
  variantId: string;
  productId: string;
  productName: string;
  slug: string;
  productSku: string;
  sku: string;
  optionValues: Record<string, string>;
  price: number;
  quantity: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  costPrice: number | null;
  updatedAt: string;
}

export function useAdminInventory(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'inventory', search],
    queryFn: () =>
      api.get<{ variants: AdminInventoryVariant[]; pagination: AdminPagination }>('/admin/inventory', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminStockMovement {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  delta: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
  actor: string | null;
}

export function useAdminMovements(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'movements', search],
    queryFn: () =>
      api.get<{ movements: AdminStockMovement[]; pagination: AdminPagination }>('/admin/inventory/movements', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminSupplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  productCount: number;
  updatedAt: string;
}

export function useAdminSuppliers() {
  return useQuery({
    queryKey: ['admin', 'suppliers'],
    queryFn: () => api.get<{ suppliers: AdminSupplier[] }>('/admin/suppliers'),
  });
}

export interface AdminSupplierDetail {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  products: {
    productId: string;
    name: string;
    sku: string;
    costPrice: number | null;
    leadTimeDays: number | null;
    minOrderQty: number | null;
  }[];
}

export function useAdminSupplier(id: string) {
  return useQuery({
    queryKey: ['admin', 'supplier', id],
    queryFn: () => api.get<{ supplier: AdminSupplierDetail }>(`/admin/suppliers/${id}`),
    enabled: Boolean(id),
  });
}

/* --------------------------------------------------------------- Customers */

export interface AdminCustomer {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  roles: string[];
  isStaff: boolean;
  orderCount: number;
  paidTotal: number;
  lastOrderAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export function useAdminCustomers(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'customers', search],
    queryFn: () =>
      api.get<{ customers: AdminCustomer[]; pagination: AdminPagination }>('/admin/customers', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminCustomerDetail extends AdminCustomer {
  stats: {
    orders: number;
    cancelled: number;
    refundedTotal: number;
    averageOrder: number;
    firstOrderAt: string | null;
  };
  addresses: {
    id: string;
    label: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    region: string;
    postalCode: string | null;
    country: string;
    isDefault: boolean;
  }[];
  recentOrders: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    total: number;
    itemCount: number;
    placedAt: string;
  }[];
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () =>
      api.get<{ customer: AdminCustomerDetail; permissions: { orders: boolean } }>(`/admin/customers/${id}`),
    enabled: Boolean(id),
  });
}

/* ------------------------------------------------------------------- Staff */

export interface AdminRole {
  key: string;
  name: string;
  description: string;
  isStaff: boolean;
  permissions: string[];
}

export function useAdminRoles(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get<{ roles: AdminRole[] }>('/admin/staff/roles'),
    staleTime: 5 * 60_000,
    enabled,
  });
}

export interface AdminStaff {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  roles: string[];
  createdAt: string;
  lastLoginAt: string | null;
}

export function useAdminStaff(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'staff', search],
    queryFn: () => api.get<{ staff: AdminStaff[]; pagination: AdminPagination }>('/admin/staff', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminStaffDetail extends AdminStaff {
  permissions: string[];
  isSelf: boolean;
}

export function useAdminStaffMember(id: string) {
  return useQuery({
    queryKey: ['admin', 'staff-member', id],
    queryFn: () => api.get<{ staff: AdminStaffDetail }>(`/admin/staff/${id}`),
    enabled: Boolean(id),
  });
}

/* -------------------------------------------------------------- Promotions */

export interface AdminCoupon {
  id: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  isActive: boolean;
  appliesTo: 'all' | 'products' | 'categories';
  status: string;
  redemptions: number;
  discountGiven: number;
  createdAt: string;
  updatedAt: string;
}

export function useAdminCoupons(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'coupons', search],
    queryFn: () => api.get<{ coupons: AdminCoupon[]; pagination: AdminPagination }>('/admin/coupons', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminCouponDetail extends AdminCoupon {
  productIds: string[];
  categoryIds: string[];
  products: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

export function useAdminCoupon(id: string) {
  return useQuery({
    queryKey: ['admin', 'coupon', id],
    queryFn: () => api.get<{ coupon: AdminCouponDetail }>(`/admin/coupons/${id}`),
    enabled: Boolean(id),
  });
}

export interface AdminBanner {
  id: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  imageUrl: string | null;
  linkUrl: string | null;
  linkLabel: string;
  placement: string;
  theme: string;
  position: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
}

export function useAdminBanners() {
  return useQuery({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<{ banners: AdminBanner[] }>('/admin/banners'),
  });
}

export interface AdminSubscriber {
  id: string;
  email: string;
  status: string;
  source: string;
  createdAt: string;
  confirmedAt: string | null;
}

export function useAdminSubscribers(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'subscribers', search],
    queryFn: () =>
      api.get<{ subscribers: AdminSubscriber[]; counts: Record<string, number>; pagination: AdminPagination }>(
        '/admin/newsletter/subscribers',
        search,
      ),
    placeholderData: (previous) => previous,
  });
}

/* ----------------------------------------------------------------- Reviews */

export interface AdminReview {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customer: { id: string; name: string; email: string };
  orderNumber: string | null;
  rating: number;
  title: string;
  body: string;
  status: string;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useAdminReviews(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'reviews', search],
    queryFn: () =>
      api.get<{ reviews: AdminReview[]; counts: Record<string, number>; pagination: AdminPagination }>(
        '/admin/reviews',
        search,
      ),
    placeholderData: (previous) => previous,
  });
}

/* ----------------------------------------------------------------- Reports */

export interface AdminSalesReport {
  range: AdminRange;
  summary: {
    orders: number;
    revenue: number;
    units: number;
    discounts: number;
    shipping: number;
    refunds: number;
    netRevenue: number;
    averageOrderValue: number;
  };
  series: { date: string; orders: number; revenue: number; units: number; discounts: number; shipping: number }[];
  paymentMix: { method: string; orders: number; revenue: number }[];
  categories: { name: string; units: number; revenue: number }[];
}

export function useAdminSalesReport(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'report-sales', search],
    queryFn: () => api.get<AdminSalesReport>('/admin/reports/sales', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminProductReport {
  range: AdminRange;
  products: {
    productId: string;
    name: string;
    slug: string;
    sku: string;
    units: number;
    revenue: number;
    orders: number;
    lastSoldAt: string | null;
  }[];
}

export function useAdminProductReport(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'report-products', search],
    queryFn: () => api.get<AdminProductReport>('/admin/reports/products', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminCustomerReport {
  range: AdminRange;
  summary: {
    newCustomers: number;
    previousNewCustomers: number;
    buyers: number;
    repeatBuyers: number;
  };
  topCustomers: {
    id: string;
    name: string;
    email: string;
    orders: number;
    spend: number;
    lastOrderAt: string | null;
  }[];
}

export function useAdminCustomerReport(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'report-customers', search],
    queryFn: () => api.get<AdminCustomerReport>('/admin/reports/customers', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminPaymentReport {
  range: AdminRange;
  providers: { provider: string; status: string; count: number; amount: number }[];
  refunds: { status: string; count: number; amount: number }[];
  codOutstanding: { orders: number; amount: number };
  failedPayments: number;
}

export function useAdminPaymentReport(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'report-payments', search],
    queryFn: () => api.get<AdminPaymentReport>('/admin/reports/payments', search),
    placeholderData: (previous) => previous,
  });
}

export interface AdminInventoryReport {
  generatedAt: string;
  showCost: boolean;
  totals: {
    variants: number;
    units: number;
    lowStock: number;
    outOfStock: number;
    retailValue: number;
    costValue: number;
  };
  variants: {
    variantId: string;
    productId: string;
    productName: string;
    slug: string;
    sku: string;
    quantity: number;
    reserved: number;
    available: number;
    threshold: number;
    price: number;
    costPrice: number | null;
    retailValue: number;
    costValue: number | null;
    updatedAt: string;
  }[];
}

export function useAdminInventoryReport(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'report-inventory'],
    queryFn: () => api.get<AdminInventoryReport>('/admin/reports/inventory'),
    enabled,
  });
}

/* ------------------------------------------------------------------- Audit */

export interface AdminAuditEntry {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  createdAt: string;
}

export function useAdminAudit(search: SearchParams) {
  return useQuery({
    queryKey: ['admin', 'audit', search],
    queryFn: () => api.get<{ entries: AdminAuditEntry[]; pagination: AdminPagination }>('/admin/audit', search),
    placeholderData: (previous) => previous,
  });
}

/* ---------------------------------------------------------------- Settings */

export interface AdminDeliveryMethod {
  id: string;
  label: string;
  description: string;
  fee: number;
  enabled: boolean;
}

export interface AdminSettings {
  store: {
    name: string;
    legalName: string;
    tagline: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    currency: string;
    timezone: string;
  };
  announcement: { enabled: boolean; message: string; link?: string };
  deliveryMethods: AdminDeliveryMethod[];
  freeShippingThreshold: number;
  socialLinks: { label: string; url: string }[];
  returns: { summary: string; windowDays: number };
  seo: { title: string; description: string; keywords: string };
  supportHours: { timezone: string; weekdays: string };
  payments: { cod: boolean; chapa: boolean };
  invoice: { companyName: string; address: string; tin: string; footerNote: string };
  reservations: { minutes: number; low_stock_threshold: number };
}

export interface AdminSettingsResponse {
  settings: AdminSettings;
  providers: { key: string; label: string; implemented: boolean; enabled: boolean }[];
  meta: { key: string; isPublic: boolean; updatedAt: string; updatedBy: string | null }[];
}

export function useAdminSettings(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AdminSettingsResponse>('/admin/settings'),
    enabled,
  });
}

export interface AdminContentPage {
  id: string;
  slug: string;
  title: string;
  bodyMd: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useAdminContent(enabled = true) {
  return useQuery({
    queryKey: ['admin', 'content'],
    queryFn: () => api.get<{ pages: AdminContentPage[] }>('/admin/content'),
    enabled,
  });
}

/* ---------------------------------------------------------------- Mutations */

export function useAdminInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}

export function useAdminMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  options: { onSuccess?: (result: TResult) => void; invalidate?: boolean } = {},
) {
  const invalidate = useAdminInvalidate();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      if (options.invalidate !== false) void invalidate();
      options.onSuccess?.(result);
    },
  });
}
