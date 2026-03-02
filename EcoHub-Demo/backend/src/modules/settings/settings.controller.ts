import { Response, NextFunction } from 'express';
import * as settingsService from './settings.service';
import { success, created, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { RoleName } from '@prisma/client';
import { badRequest } from '../../middlewares/error.middleware';

export const getReportSubscriptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queryShopId = typeof req.query?.shopId === 'string' && req.query.shopId.trim() ? req.query.shopId.trim() : null;
    const isSuperAdmin = req.user?.roles?.includes(RoleName.super_admin);
    const shopId = (isSuperAdmin && queryShopId) ? queryShopId : (req.user?.shopId ?? null);
    const subscriptions = await settingsService.getReportSubscriptions(shopId);
    success(res, subscriptions);
  } catch (error) {
    console.error('[getReportSubscriptions]', error);
    success(res, []);
  }
};

const REPORT_TYPES = ['financial', 'operational', 'both'] as const;

export const createReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const reportType = typeof body.reportType === 'string' ? body.reportType : 'both';
    if (!email) {
      next(badRequest('Vui lòng nhập email'));
      return;
    }
    if (!REPORT_TYPES.includes(reportType as any)) {
      next(badRequest('Loại báo cáo không hợp lệ. Chọn: financial, operational hoặc both'));
      return;
    }
    const shopIdFromContext = req.user?.shopId ?? null;
    const shopIdFromBody = typeof body.shopId === 'string' && body.shopId.trim() ? body.shopId.trim() : null;
    const isSuperAdmin = req.user?.roles?.includes(RoleName.super_admin);
    
    // Nếu đang assume shop (có shopId trong context), chỉ cho phép tạo cho shop đó
    if (shopIdFromContext) {
      if (shopIdFromBody && shopIdFromBody !== shopIdFromContext) {
        const { forbidden } = await import('../../middlewares/error.middleware');
        next(forbidden('Không thể thêm email cho shop khác khi đang ở chế độ quản lý shop. Vui lòng thoát quản lý shop trước.'));
        return;
      }
    }
    
    const effectiveShopId = shopIdFromBody || shopIdFromContext;
    if (!effectiveShopId) {
      next(badRequest('Vui lòng chọn shop hoặc vào ngữ cảnh shop trước khi thêm email nhận báo cáo'));
      return;
    }
    const subscription = await settingsService.createReportSubscription(
      { email, reportType: reportType as 'financial' | 'operational' | 'both', enabled: body.enabled, shopId: effectiveShopId },
      shopIdFromContext
    );
    created(res, subscription, 'Đã thêm email nhận báo cáo');
  } catch (error: any) {
    const msg = error?.message || '';
    const errorStr = JSON.stringify(error);
    
    // Kiểm tra các lỗi Prisma phổ biến
    const isPrismaError = 
      msg.includes('Unknown argument') ||
      msg.includes('prisma') && msg.includes('invocation') ||
      msg.includes('Unknown field') ||
      msg.includes('Invalid field') ||
      errorStr.includes('Unknown argument') ||
      errorStr.includes('Unknown field');
    
    if (isPrismaError) {
      console.error('[createReportSubscription] Prisma schema mismatch:', error);
      const instruction = process.env.NODE_ENV === 'production' 
        ? 'Liên hệ admin để regenerate Prisma client trong Docker container.'
        : 'Nếu chạy local: cd backend && npx prisma generate. Nếu chạy Docker: docker exec ecohub-backend npx prisma generate && docker restart ecohub-backend';
      next(badRequest(`Prisma client chưa đồng bộ schema. ${instruction}`));
      return;
    }
    
    console.error('[createReportSubscription] Error:', error);
    next(error);
  }
};

export const updateReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shopId = req.user?.shopId ?? null;
    const subscription = await settingsService.updateReportSubscription(req.params.id, req.body, shopId);
    success(res, subscription, 'Đã cập nhật cấu hình email');
  } catch (error) {
    next(error);
  }
};

export const deleteReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shopId = req.user?.shopId ?? null;
    await settingsService.deleteReportSubscription(req.params.id, shopId);
    noContent(res);
  } catch (error) {
    next(error);
  }
};
