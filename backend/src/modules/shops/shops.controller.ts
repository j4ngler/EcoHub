import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as shopsService from './shops.service';
import { created, success, noContent } from '../../utils/response';

export const listShops = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shops = await shopsService.listShopsForUser(req.user!.userId, req.user!.roles);
    success(res, shops);
  } catch (err) {
    next(err);
  }
};

export const createShop = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Khi đang assume shop (impersonating), không cho phép tạo shop mới
    if (req.user?.impersonating || req.user?.shopId) {
      const { forbidden } = await import('../../middlewares/error.middleware');
      return next(forbidden('Không thể tạo shop khi đang ở chế độ quản lý shop. Vui lòng thoát quản lý shop trước.'));
    }
    const shop = await shopsService.createShop(req.body);
    created(res, shop, 'Tạo shop thành công');
  } catch (err) {
    next(err);
  }
};

export const deleteShop = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Khi đang assume shop (impersonating), không cho phép xóa shop
    if (req.user?.impersonating || req.user?.shopId) {
      const { forbidden } = await import('../../middlewares/error.middleware');
      return next(forbidden('Không thể xóa shop khi đang ở chế độ quản lý shop. Vui lòng thoát quản lý shop trước.'));
    }
    await shopsService.deleteShop(
      req.params.id,
      req.user!.userId,
      req.user!.roles as any,
      req.body.superAdminPassword
    );
    noContent(res);
  } catch (err) {
    next(err);
  }
};

