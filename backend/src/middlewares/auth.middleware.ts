import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { unauthorized, forbidden } from './error.middleware';
import { RoleName } from '@prisma/client';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: RoleName[];
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

      // Verify user still exists
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          userRoles: {
            include: { role: true }
          }
        }
      });

      if (!user || user.status !== 'active') {
        throw unauthorized('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
      }

      req.user = {
        userId: user.id,
        email: user.email,
        roles: user.userRoles.map(ur => ur.role.name),
      };

      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw unauthorized('Token đã hết hạn');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw unauthorized('Token không hợp lệ');
      }
      throw error;
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

      // Super admin has all permissions
      if (req.user.roles.includes(RoleName.super_admin)) {
        return next();
      }

      // Get user's permissions
      const userRoles = await prisma.userRole.findMany({
        where: { userId: req.user.userId },
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
