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
    const queryToken = typeof req.query.access_token === 'string' ? req.query.access_token : null;

    if ((!authHeader || !authHeader.startsWith('Bearer ')) && !queryToken) {
      throw unauthorized('Token khong duoc cung cap');
    }

    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken!;

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;

      let user;
      try {
        user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: {
            userRoles: {
              include: { role: true },
            },
          },
        });
      } catch (dbError) {
        console.error('[authenticate] Database error:', dbError);
        return next(serviceUnavailable('Khong ket noi duoc database. Kiem tra backend va PostgreSQL.'));
      }

      if (!user || user.status !== 'active') {
        throw unauthorized('Tai khoan khong ton tai hoac da bi vo hieu hoa');
      }

      let roles: JwtPayload['roles'];
      try {
        roles = user.userRoles.map((ur) => ur.role.name);
      } catch (e) {
        console.error('[authenticate] Error mapping roles:', e);
        return next(serviceUnavailable('Loi xu ly quyen. Kiem tra du lieu UserRole/Role.'));
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
        throw unauthorized('Token da het han');
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw unauthorized('Token khong hop le');
      }
      if ((error as any)?.statusCode === 401) {
        return next(error);
      }
      console.error('[authenticate] Unexpected error:', error);
      return next(serviceUnavailable('Loi xac thuc. Thu dang nhap lai.'));
    }
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles: RoleName[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw unauthorized('Chua xac thuc');
      }

      const hasRole = req.user.roles.some((role) => allowedRoles.includes(role));

      if (!hasRole) {
        throw forbidden('Khong co quyen thuc hien hanh dong nay');
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
        throw unauthorized('Chua xac thuc');
      }

      const activeShopId = req.user.shopId ?? null;

      if (!req.user.impersonating && req.user.roles.includes(RoleName.super_admin)) {
        return next();
      }

      const userRoles = await prisma.userRole.findMany({
        where: {
          userId: req.user.userId,
          ...(activeShopId ? { OR: [{ shopId: activeShopId }, { shopId: null }] } : {}),
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      const userPermissions = new Set<string>();
      userRoles.forEach((ur) => {
        ur.role.permissions.forEach((rp) => {
          userPermissions.add(rp.permission.name);
        });
      });

      const hasPermission = requiredPermissions.every((p) => userPermissions.has(p));

      if (!hasPermission) {
        throw forbidden('Khong co quyen thuc hien hanh dong nay');
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
