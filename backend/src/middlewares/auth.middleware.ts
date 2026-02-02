import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { unauthorized, forbidden, serviceUnavailable } from './error.middleware';
import { RoleName } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: RoleName[];
  shopId?: string | null;
  impersonating?: boolean;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw unauthorized('Token không được cung cấp');
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret'
      ) as JwtPayload;

      let user;
      try {
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            userRoles: {
              include: { role: true }
            }
          }
        });
      } catch (dbError) {
        console.error('[authenticate] Database error:', dbError);
        return next(serviceUnavailable('Không kết nối được database. Kiểm tra backend và PostgreSQL.'));
      }

      if (!user || user.status !== 'active') {
        throw unauthorized('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
      }

      let roles: JwtPayload['roles'];
      try {
        roles = decoded.roles || user.userRoles.map(ur => ur.role.name);
      } catch (e) {
        console.error('[authenticate] Error mapping roles:', e);
        return next(serviceUnavailable('Lỗi xử lý quyền. Kiểm tra dữ liệu UserRole/Role.'));
      }

      req.user = {
        userId: user.id,
        email: user.email,
        roles,
        shopId: decoded.shopId ?? null,
        impersonating: decoded.impersonating ?? false,
      };

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw unauthorized('Token đã hết hạn');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw unauthorized('Token không hợp lệ');
      }
      if ((error as any)?.statusCode === 401) {
        return next(error);
      }
      console.error('[authenticate] Unexpected error:', error);
      return next(serviceUnavailable('Lỗi xác thực. Thử đăng nhập lại.'));
    }
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles: RoleName[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw unauthorized('Chưa xác thực');
      }

      const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
      
      if (!hasRole) {
        throw forbidden('Không có quyền thực hiện hành động này');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

export const authorizePermission = (...requiredPermissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw unauthorized('Chưa xác thực');
      }

      const activeShopId = req.user.shopId ?? null;

      // Super admin has all permissions (trừ khi đang impersonate shop)
      if (!req.user.impersonating && req.user.roles.includes(RoleName.super_admin)) {
        return next();
      }

      // Get user's permissions
      const userRoles = await prisma.userRole.findMany({
        where: {
          userId: req.user.userId,
          ...(activeShopId ? { OR: [{ shopId: activeShopId }, { shopId: null }] } : {}),
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true }
              }
            }
          }
        }
      });

      const userPermissions = new Set<string>();
      userRoles.forEach(ur => {
        ur.role.permissions.forEach(rp => {
          userPermissions.add(rp.permission.name);
        });
      });

      const hasPermission = requiredPermissions.every(p => userPermissions.has(p));
      
      if (!hasPermission) {
        throw forbidden('Không có quyền thực hiện hành động này');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
