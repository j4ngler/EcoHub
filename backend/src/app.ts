import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import orderRoutes from './modules/orders/orders.routes';
import productRoutes from './modules/products/products.routes';
import videoRoutes from './modules/videos/videos.routes';
import shippingRoutes from './modules/shipping/shipping.routes';
import channelRoutes from './modules/channels/channels.routes';
import reportRoutes from './modules/reports/reports.routes';
import returnRoutes from './modules/returns/returns.routes';
import metaRoutes from './modules/meta/meta.routes';

// Import middlewares
import { errorHandler } from './middlewares/error.middleware';

const app: Application = express();

// ===========================================
// MIDDLEWARES
// ===========================================

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// Request logging
app.use(morgan('dev'));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau 15 phút',
  },
});
app.use('/api', limiter);

// ===========================================
// ROUTES
// ===========================================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'EcoHub API is running',
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/meta', metaRoutes);

// API Documentation
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'EcoHub API Documentation',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register': 'Đăng ký tài khoản',
        'POST /api/auth/login': 'Đăng nhập',
        'POST /api/auth/logout': 'Đăng xuất',
        'POST /api/auth/refresh-token': 'Làm mới token',
        'GET /api/auth/me': 'Lấy thông tin user hiện tại',
      },
      users: {
        'GET /api/users': 'Danh sách users',
        'GET /api/users/:id': 'Chi tiết user',
        'POST /api/users': 'Tạo user mới',
        'PUT /api/users/:id': 'Cập nhật user',
        'DELETE /api/users/:id': 'Xóa user',
      },
      orders: {
        'GET /api/orders': 'Danh sách đơn hàng',
        'GET /api/orders/:id': 'Chi tiết đơn hàng',
        'POST /api/orders': 'Tạo đơn hàng mới',
        'PUT /api/orders/:id': 'Cập nhật đơn hàng',
        'PUT /api/orders/:id/status': 'Cập nhật trạng thái',
        'DELETE /api/orders/:id': 'Hủy đơn hàng',
        'GET /api/orders/tracking/:code': 'Tra cứu theo mã vận đơn',
      },
      products: {
        'GET /api/products': 'Danh sách sản phẩm',
        'GET /api/products/:id': 'Chi tiết sản phẩm',
        'POST /api/products': 'Thêm sản phẩm mới',
        'PUT /api/products/:id': 'Cập nhật sản phẩm',
        'DELETE /api/products/:id': 'Xóa sản phẩm',
      },
      videos: {
        'GET /api/videos': 'Danh sách video',
        'GET /api/videos/:id': 'Chi tiết video',
        'POST /api/videos/upload': 'Upload video đóng gói',
        'PUT /api/videos/:id/approve': 'Phê duyệt video',
        'GET /api/videos/tracking/:code': 'Video theo mã vận đơn',
      },
      shipping: {
        'GET /api/shipping/carriers': 'Danh sách hãng vận chuyển',
        'POST /api/shipping/calculate-fee': 'Tính phí vận chuyển',
        'GET /api/shipping/track/:trackingCode': 'Theo dõi vận đơn',
      },
      channels: {
        'GET /api/channels': 'Danh sách kênh bán hàng',
        'POST /api/channels/:id/connect': 'Kết nối kênh',
        'POST /api/channels/:id/sync-orders': 'Đồng bộ đơn hàng',
      },
      reports: {
        'GET /api/reports/dashboard': 'Dashboard tổng quan',
        'GET /api/reports/orders': 'Báo cáo đơn hàng',
        'GET /api/reports/videos': 'Báo cáo video',
        'GET /api/reports/revenue': 'Báo cáo doanh thu',
      },
      returns: {
        'GET /api/returns': 'Danh sách yêu cầu hoàn trả',
        'POST /api/returns': 'Tạo yêu cầu hoàn trả',
        'PUT /api/returns/:id/approve': 'Duyệt hoàn trả',
        'PUT /api/returns/:id/reject': 'Từ chối hoàn trả',
      },
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Không tìm thấy endpoint',
  });
});

// Error handler
app.use(errorHandler);

export default app;
