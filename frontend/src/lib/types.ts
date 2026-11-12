export interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}

export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  brand: { id: string; name: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  priceSantim: number;
  compareAtPriceSantim: number | null;
  minPriceSantim: number;
  maxPriceSantim: number;
  discountPercent: number | null;
  imageUrl: string | null;
  imageAlt: string;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  available: number;
  lowStockThreshold: number;
  inStock: boolean;
  lowStock: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isWishlisted: boolean;
  colors: string[];
  sizes: string[];
  publishedAt: string | null;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  productCount: number;
}

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  eyebrow: string;
  imageUrl: string | null;
  linkUrl: string;
  linkLabel: string;
  placement: string;
  theme: string;
  position: number;
}

export interface Testimonial {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerName: string;
  createdAt: string;
  product: { name: string; slug: string } | null;
}

export interface SiteSettings {
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
  announcement: { enabled: boolean; message: string; link: string };
  deliveryMethods: {
    id: string;
    label: string;
    description: string;
    fee: number;
    enabled: boolean;
  }[];
  freeShippingThreshold: number;
  socialLinks: { label: string; url: string }[];
  returns: { summary: string; windowDays: number };
  seo: { title: string; description: string; keywords: string };
  supportHours: { timezone: string; weekdays: string };
  pages: { slug: string; title: string }[];
}

export interface HomeData {
  banners: { hero: Banner[]; promo: Banner[] };
  categories: CategoryNode[];
  sections: {
    featured: ProductCardData[];
    bestSellers: ProductCardData[];
    newArrivals: ProductCardData[];
    deals: ProductCardData[];
    recommended: ProductCardData[];
  };
  brands: Brand[];
  testimonials: Testimonial[];
  settings: SiteSettings;
}

export interface ProductListResult {
  items: ProductCardData[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort: string;
  facets?: {
    brands: { slug: string; name: string; count: number }[];
    attributes: { name: string; values: { value: string; count: number }[] }[];
    priceMin: number;
    priceMax: number;
  };
}

export interface ProductVariant {
  id: string;
  sku: string;
  optionValues: Record<string, string>;
  priceSantim: number;
  compareAtPriceSantim: number | null;
  imageUrl: string | null;
  available: number;
  inStock: boolean;
  lowStock: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  sku: string;
  barcode: string | null;
  shortDescription: string;
  description: string;
  priceSantim: number;
  compareAtPriceSantim: number | null;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  viewCount: number;
  isFeatured: boolean;
  specs: { label: string; value: string }[];
  warrantyInfo: string;
  returnInfo: string;
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  brand: { id: string; name: string; slug: string } | null;
  images: { id: string; url: string; alt: string }[];
  options: { id: string; name: string; values: { id: string; value: string }[] }[];
  attributes: { name: string; value: string }[];
  variants: ProductVariant[];
  availableTotal: number;
  inStock: boolean;
  lowStock: boolean;
  isWishlisted: boolean;
  breadcrumbs: { id: string; name: string; slug: string }[];
  reviewSummary: {
    average: number;
    total: number;
    distribution: { rating: number; count: number }[];
  };
  related: ProductCardData[];
}

export interface ReviewItem {
  id: string;
  rating: number;
  title: string;
  body: string;
  reviewerName: string;
  verifiedPurchase: boolean;
  adminReply: string | null;
  createdAt: string;
}

export interface ReviewPage {
  summary: {
    average: number;
    total: number;
    distribution: { rating: number; count: number }[];
  };
  items: ReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  roles: string[];
  permissions: string[];
  isStaff: boolean;
  marketingOptIn: boolean;
  notificationPrefs: Record<string, boolean>;
  createdAt: string;
}

export interface CartLine {
  cartItemId: string;
  productId: string;
  variantId: string;
  name: string;
  slug: string;
  sku: string;
  brandName: string | null;
  imageUrl: string | null;
  variantLabel: string;
  options: Record<string, string>;
  unitPrice: number;
  compareAtPrice: number | null;
  priceWhenAdded: number | null;
  priceChanged: boolean;
  quantity: number;
  lineTotal: number;
  stockQuantity: number;
  reserved: number;
  available: number;
  maxQuantity: number;
  stockIssue: string | null;
  unavailable: boolean;
  categoryId: string | null;
}

export interface CartView {
  id: string | null;
  couponCode: string | null;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  total: number;
  coupon: { code: string; description: string; discountType: string; discountValue: number } | null;
  couponError: string | null;
  hasIssues: boolean;
  currency: string;
  freeShippingThreshold: number;
  deliveryMethods: { id: string; label: string; description: string; fee: number; effectiveFee: number }[];
  shippingEstimate?: { method: string; fee: number } | null;
}

export interface Address {
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
}

export interface PaymentOption {
  id: string;
  label: string;
  description: string;
  available: boolean;
  configured: boolean;
  implemented: boolean;
  requiresSetup: boolean;
  note?: string | null;
}

export interface CheckoutOverview {
  cart: CartView;
  addresses: Address[];
  deliveryMethods: { id: string; label: string; description: string; fee: number; effectiveFee: number }[];
  freeShippingThreshold: number;
  paymentOptions: PaymentOption[];
  contact: { fullName: string; email: string; phone: string };
  store: SiteSettings['store'];
  emailVerified: boolean;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  placedAt: string;
  itemCount: number;
  imageUrl: string | null;
}

export interface PlacedOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
  deliveryMethod: string;
  deliveryLabel: string;
  placedAt: string;
  reservationExpiresAt: string | null;
  replayed: boolean;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryMethod: string;
  deliveryLabel: string;
  customerName: string;
  email: string;
  phone: string;
  shippingAddress: Record<string, string | null>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  total: number;
  currency: string;
  couponCode: string | null;
  customerNote: string | null;
  adminNote: string | null;
  placedAt: string;
  reservationExpiresAt: string | null;
  confirmedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: {
    id: string;
    productId: string | null;
    name: string;
    slug: string;
    variantLabel: string;
    sku: string;
    imageUrl: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }[];
  history: { status: string; note: string | null; createdAt: string }[];
  shipment: {
    carrier: string;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string;
    shippedAt: string | null;
    deliveredAt: string | null;
  } | null;
  payment: {
    provider: string;
    status: string;
    amount: number;
    reference: string | null;
  } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AccountStats {
  orders: number;
  activeOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  unreadNotifications: number;
  wishlistItems: number;
  reviews: number;
  addresses: number;
}

export interface AccountSummary {
  stats: AccountStats;
  recentOrders: OrderSummary[];
  defaultAddress: Address | null;
  memberSince: string;
}

export interface AccountNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: AccountNotification[];
  unreadCount: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AccountReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  status: 'pending' | 'approved' | 'rejected';
  adminReply: string | null;
  createdAt: string;
  product: { name: string; slug: string; imageUrl: string | null };
}

export interface PendingReview {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  orderNumber: string;
  deliveredAt: string | null;
}

export interface AccountReviewPage {
  reviews: AccountReview[];
  pending: PendingReview[];
  counts: { total: number; pending: number; approved: number };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface SessionInfo {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

