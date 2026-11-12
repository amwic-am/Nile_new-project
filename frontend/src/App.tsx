import { lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AccountLayout } from '@/components/account/AccountLayout';
import { AdminLayout, AdminPerm, AdminRoot } from '@/components/admin/AdminLayout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { Layout } from '@/components/layout/Layout';
import CartPage from '@/pages/Cart';
import CatalogPage from '@/pages/Catalog';
import ContentPage from '@/pages/ContentPage';
import HomePage from '@/pages/Home';
import NotFoundPage from '@/pages/NotFound';
import ProductDetailPage from '@/pages/ProductDetail';

const AccountAddressesPage = lazy(() => import('@/pages/account/Addresses'));
const AccountNotificationsPage = lazy(() => import('@/pages/account/Notifications'));
const AccountOrderDetailPage = lazy(() => import('@/pages/account/OrderDetail'));
const AccountOrdersPage = lazy(() => import('@/pages/account/Orders'));
const AccountOverviewPage = lazy(() => import('@/pages/account/Overview'));
const AccountProfilePage = lazy(() => import('@/pages/account/Profile'));
const AccountReviewsPage = lazy(() => import('@/pages/account/Reviews'));
const AccountSecurityPage = lazy(() => import('@/pages/account/Security'));
const AccountWishlistPage = lazy(() => import('@/pages/account/Wishlist'));
const CheckoutPage = lazy(() => import('@/pages/Checkout'));
const OrderConfirmationPage = lazy(() => import('@/pages/OrderConfirmation'));
const PaymentCallbackPage = lazy(() => import('@/pages/PaymentCallback'));
const LoginPage = lazy(() => import('@/pages/auth/Login'));
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/Password').then((module) => ({ default: module.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/Password').then((module) => ({ default: module.ResetPasswordPage })),
);
const RegisterPage = lazy(() => import('@/pages/auth/Register'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmail'));

const AdminAuditPage = lazy(() => import('@/pages/admin/Audit'));
const AdminCategoriesPage = lazy(() => import('@/pages/admin/Categories'));
const AdminCustomersPage = lazy(() => import('@/pages/admin/Customers'));
const AdminCustomerDetailPage = lazy(() => import('@/pages/admin/CustomerDetail'));
const AdminDashboardPage = lazy(() => import('@/pages/admin/Dashboard'));
const AdminInventoryPage = lazy(() => import('@/pages/admin/Inventory'));
const AdminOrderDetailPage = lazy(() => import('@/pages/admin/OrderDetail'));
const AdminOrdersPage = lazy(() => import('@/pages/admin/Orders'));
const AdminProductEditorPage = lazy(() => import('@/pages/admin/ProductEditor'));
const AdminProductsPage = lazy(() => import('@/pages/admin/Products'));
const AdminPromotionsPage = lazy(() => import('@/pages/admin/Promotions'));
const AdminReportsPage = lazy(() => import('@/pages/admin/Reports'));
const AdminReviewsPage = lazy(() => import('@/pages/admin/Reviews'));
const AdminSettingsPage = lazy(() => import('@/pages/admin/Settings'));
const AdminStaffPage = lazy(() => import('@/pages/admin/Staff'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="products" element={<CatalogPage mode="all" />} />
            <Route path="category/:slug" element={<CatalogPage mode="category" />} />
            <Route path="search" element={<CatalogPage mode="search" />} />
            <Route path="product/:slug" element={<ProductDetailPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route
              path="checkout"
              element={
                <RequireAuth>
                  <CheckoutPage />
                </RequireAuth>
              }
            />
            <Route
              path="checkout/success/:orderId"
              element={
                <RequireAuth>
                  <OrderConfirmationPage />
                </RequireAuth>
              }
            />
            <Route
              path="checkout/payment/callback"
              element={
                <RequireAuth>
                  <PaymentCallbackPage />
                </RequireAuth>
              }
            />

            <Route
              path="account"
              element={
                <RequireAuth>
                  <AccountLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AccountOverviewPage />} />
              <Route path="profile" element={<AccountProfilePage />} />
              <Route path="orders" element={<AccountOrdersPage />} />
              <Route path="orders/:orderId" element={<AccountOrderDetailPage />} />
              <Route path="addresses" element={<AccountAddressesPage />} />
              <Route path="wishlist" element={<AccountWishlistPage />} />
              <Route path="reviews" element={<AccountReviewsPage />} />
              <Route path="notifications" element={<AccountNotificationsPage />} />
              <Route path="security" element={<AccountSecurityPage />} />
            </Route>

            <Route path="login" element={<LoginPage />} />
            <Route path="register" element={<RegisterPage />} />
            <Route path="forgot-password" element={<ForgotPasswordPage />} />
            <Route path="reset-password" element={<ResetPasswordPage />} />
            <Route path="verify-email" element={<VerifyEmailPage />} />

            <Route path="about" element={<ContentPage slug="about" />} />
            <Route path="contact" element={<ContentPage slug="contact" />} />
            <Route path="shipping" element={<ContentPage slug="shipping" />} />
            <Route path="returns" element={<ContentPage slug="returns" />} />
            <Route path="privacy" element={<ContentPage slug="privacy" />} />
            <Route path="terms" element={<ContentPage slug="terms" />} />
            <Route path="content/:slug" element={<ContentPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>

          <Route path="admin" element={<AdminRoot />}>
            <Route element={<AdminLayout />}>
              <Route
                index
                element={
                  <AdminPerm anyOf={['dashboard.view']}>
                    <AdminDashboardPage />
                  </AdminPerm>
                }
              />
              <Route
                path="orders"
                element={
                  <AdminPerm anyOf={['orders.read']}>
                    <AdminOrdersPage />
                  </AdminPerm>
                }
              />
              <Route
                path="orders/:orderId"
                element={
                  <AdminPerm anyOf={['orders.read']}>
                    <AdminOrderDetailPage />
                  </AdminPerm>
                }
              />
              <Route
                path="products"
                element={
                  <AdminPerm anyOf={['products.read']}>
                    <AdminProductsPage />
                  </AdminPerm>
                }
              />
              <Route
                path="products/new"
                element={
                  <AdminPerm anyOf={['products.write']}>
                    <AdminProductEditorPage />
                  </AdminPerm>
                }
              />
              <Route
                path="products/:productId"
                element={
                  <AdminPerm anyOf={['products.read']}>
                    <AdminProductEditorPage />
                  </AdminPerm>
                }
              />
              <Route
                path="categories"
                element={
                  <AdminPerm anyOf={['products.read']}>
                    <AdminCategoriesPage />
                  </AdminPerm>
                }
              />
              <Route
                path="inventory"
                element={
                  <AdminPerm anyOf={['inventory.read']}>
                    <AdminInventoryPage />
                  </AdminPerm>
                }
              />
              <Route
                path="customers"
                element={
                  <AdminPerm anyOf={['customers.read']}>
                    <AdminCustomersPage />
                  </AdminPerm>
                }
              />
              <Route
                path="customers/:customerId"
                element={
                  <AdminPerm anyOf={['customers.read']}>
                    <AdminCustomerDetailPage />
                  </AdminPerm>
                }
              />
              <Route
                path="promotions"
                element={
                  <AdminPerm anyOf={['promotions.read']}>
                    <AdminPromotionsPage />
                  </AdminPerm>
                }
              />
              <Route
                path="reviews"
                element={
                  <AdminPerm anyOf={['reviews.moderate']}>
                    <AdminReviewsPage />
                  </AdminPerm>
                }
              />
              <Route
                path="reports"
                element={
                  <AdminPerm anyOf={['reports.view', 'inventory.read']}>
                    <AdminReportsPage />
                  </AdminPerm>
                }
              />
              <Route
                path="staff"
                element={
                  <AdminPerm anyOf={['staff.read']}>
                    <AdminStaffPage />
                  </AdminPerm>
                }
              />
              <Route
                path="settings"
                element={
                  <AdminPerm anyOf={['settings.read', 'content.write']}>
                    <AdminSettingsPage />
                  </AdminPerm>
                }
              />
              <Route
                path="audit"
                element={
                  <AdminPerm anyOf={['audit.read']}>
                    <AdminAuditPage />
                  </AdminPerm>
                }
              />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
