import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import MainLayout from '@/components/layout/MainLayout';
import AuthLayout from '@/components/layout/AuthLayout';
import LoginPage from '@/features/auth/pages/LoginPage';
import RegisterPage from '@/features/auth/pages/RegisterPage';
import DashboardPage from '@/features/dashboard/pages/DashboardPage';
import OrdersPage from '@/features/orders/pages/OrdersPage';
import OrderDetailPage from '@/features/orders/pages/OrderDetailPage';
import ProductsPage from '@/features/products/pages/ProductsPage';
import VideosPage from '@/features/videos/pages/VideosPage';
import CreateVideoPage from '@/features/videos/pages/CreateVideoPage';
import UsersPage from '@/features/users/pages/UsersPage';
import ProfilePage from '@/features/users/pages/ProfilePage';
import ReportsPage from '@/features/reports/pages/ReportsPage';
import TrackingPage from '@/features/tracking/pages/TrackingPage';
import InventoryPage from '@/features/products/pages/InventoryPage';
import SettingsPage from '@/features/settings/pages/SettingsPage';
import CameraSettingsPage from '@/features/settings/pages/CameraSettingsPage';
import ReceivingVideosPage from '@/features/videos/pages/ReceivingVideosPage';
import ShopsPage from '@/features/shops/pages/ShopsPage';
import ReturnsPage from '@/features/returns/pages/ReturnsPage';
import ShippingSettingsPage from '@/features/settings/pages/ShippingSettingsPage';
import ApiManagementPage from '@/features/channels/pages/ApiManagementPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

function RoleRoute({
  children,
  disallowRoles = [],
}: {
  children: React.ReactNode;
  disallowRoles?: string[];
}) {
  const user = useAuthStore((s) => s.user);
  const roles = user?.roles || [];

  if (disallowRoles.some((role) => roles.includes(role))) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth routes - split screen EcoVision style */}
        <Route element={<PublicRoute><AuthLayout /></PublicRoute>}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route path="/tracking" element={<TrackingPage />} />
        <Route path="/tracking/:trackingCode" element={<TrackingPage />} />
        
        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="orders/:id" element={<OrderDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="videos" element={<VideosPage />} />

          <Route path="videos/receiving" element={<ReceivingVideosPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="camera-settings"
            element={
              <RoleRoute disallowRoles={['super_admin']}>
                <CameraSettingsPage />
              </RoleRoute>
            }
          />
          <Route path="channel-management" element={<ApiManagementPage />} />
          <Route path="api-management" element={<Navigate to="/channel-management" replace />} />
          <Route path="settings/shipping" element={<ShippingSettingsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="shops" element={<ShopsPage />} />
        </Route>
        
        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
