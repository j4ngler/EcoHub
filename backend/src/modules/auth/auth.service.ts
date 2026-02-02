import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../../config/database';
import { unauthorized, conflict, notFound, badRequest } from '../../middlewares/error.middleware';
import { RegisterDto } from './auth.dto';
import { RoleName } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

interface TokenPayload {
  userId: string;
  email: string;
  roles: RoleName[];
  shopId?: string | null;
  impersonating?: boolean;
}

const generateTokens = (payload: TokenPayload) => {
  const accessTokenOptions: SignOptions = {
    expiresIn: JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };
  const accessToken = jwt.sign(payload, JWT_SECRET, accessTokenOptions);

  const refreshTokenOptions: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  };
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, refreshTokenOptions);

  return { accessToken, refreshToken };
};

const sanitizeUserForAuth = (user: { id: string; username: string; email: string; fullName: string; phone?: string | null; avatarUrl?: string | null }, roles: RoleName[]) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone || undefined,
  avatarUrl: user.avatarUrl || undefined,
  roles,
});

export const register = async (data: RegisterDto) => {
  // Check if email exists
  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    throw conflict('Email đã được sử dụng');
  }

  // Check if username exists
  const existingUsername = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (existingUsername) {
    throw conflict('Tên đăng nhập đã được sử dụng');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create user
  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
    },
  });

  // Assign customer role by default
  const customerRole = await prisma.role.findUnique({
    where: { name: RoleName.customer },
  });

  if (customerRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: customerRole.id,
      },
    });
  }

  // Generate tokens
  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    roles: [RoleName.customer],
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
    },
    ...tokens,
  };
};

export const login = async (email: string, password: string) => {
  // Find user
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      userRoles: {
        include: { role: true, shop: true },
      },
    },
  });

  if (!user) {
    throw unauthorized('Email hoặc mật khẩu không đúng');
  }

  if (user.status !== 'active') {
    throw unauthorized('Tài khoản đã bị vô hiệu hóa');
  }

  // Check password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw unauthorized('Email hoặc mật khẩu không đúng');
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  // Generate tokens
  const roles = user.userRoles.map(ur => ur.role.name);

  // Nếu KHÔNG phải super_admin và user có gắn với 1 shop cụ thể
  // => mặc định coi như đang làm việc trong shop đó
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const defaultShop = isSuperAdmin
    ? null
    : user.userRoles.find(ur => ur.shop)?.shop || null;

  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    roles,
    shopId: defaultShop?.id ?? null,
    impersonating: false,
  });

  return {
    user: {
      ...sanitizeUserForAuth(user, roles),
      activeShop: defaultShop
        ? { id: defaultShop.id, name: defaultShop.name, code: defaultShop.code }
        : null,
    },
    ...tokens,
  };
};

export const assumeShop = async (userId: string, shopId: string | null) => {
  // Load user + roles (có shop scope)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: { role: true, shop: true },
      },
    },
  });

  if (!user || user.status !== 'active') {
    throw unauthorized('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
  }

  // Thoát chế độ quản lý shop => token "bình thường" (giữ super_admin nếu có)
  if (!shopId) {
    const roles = user.userRoles.map(ur => ur.role.name);
    const tokens = generateTokens({ userId: user.id, email: user.email, roles, shopId: null, impersonating: false });
    return {
      user: { ...sanitizeUserForAuth(user, roles), activeShop: null },
      activeShop: null,
      ...tokens,
    };
  }

  const targetShop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, code: true },
  });
  if (!targetShop) throw notFound('Không tìm thấy shop');

  const isSuperAdmin = user.userRoles.some(ur => ur.role.name === RoleName.super_admin);

  // Role trong shop mà user có (hoặc super_admin thì cho phép vào như admin)
  const shopScopedRoles = user.userRoles.filter(ur => ur.shopId === shopId).map(ur => ur.role.name);
  const allowed = isSuperAdmin || shopScopedRoles.length > 0;
  if (!allowed) throw unauthorized('Bạn không có quyền quản lý shop này');

  // Nếu là super_admin và không có role shop => impersonate như admin để dùng đúng permission scope
  let effectiveRoles: RoleName[] =
    shopScopedRoles.length > 0 ? shopScopedRoles : [RoleName.admin];

  // Giữ lại super_admin trong token để UI vẫn biết đây là super admin,
  // nhưng authorizePermission sẽ KHÔNG auto-bypass khi impersonating = true.
  if (isSuperAdmin && !effectiveRoles.includes(RoleName.super_admin)) {
    effectiveRoles = [RoleName.super_admin, ...effectiveRoles];
  }

  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    roles: effectiveRoles,
    shopId,
    impersonating: true,
  });

  return {
    user: { ...sanitizeUserForAuth(user, effectiveRoles), activeShop: targetShop },
    activeShop: targetShop,
    ...tokens,
  };
};

export const refreshToken = async (refreshToken: string) => {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as TokenPayload;

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user || user.status !== 'active') {
      throw unauthorized('Tài khoản không tồn tại hoặc đã bị vô hiệu hóa');
    }

    // Generate new tokens - giữ nguyên shopId/impersonating từ token cũ
    const roles = user.userRoles.map(ur => ur.role.name);
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      roles,
      shopId: decoded.shopId ?? null,
      impersonating: decoded.impersonating ?? false,
    });

    return tokens;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw unauthorized('Refresh token đã hết hạn');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw unauthorized('Refresh token không hợp lệ');
    }
    throw error;
  }
};

export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userRoles: {
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
          shop: true,
        },
      },
    },
  });

  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  const roles = user.userRoles.map(ur => ur.role.name);
  const permissions = new Set<string>();
  user.userRoles.forEach(ur => {
    ur.role.permissions.forEach(rp => {
      permissions.add(rp.permission.name);
    });
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    emailVerified: user.emailVerified,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles,
    permissions: Array.from(permissions),
    shops: user.userRoles
      .filter(ur => ur.shop)
      .map(ur => ({
        id: ur.shop!.id,
        name: ur.shop!.name,
        code: ur.shop!.code,
        role: ur.role.name,
      })),
  };
};

export const updateMe = async (userId: string, data: any) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      avatarUrl: data.avatarUrl,
    },
  });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
  };
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  // Verify current password
  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValidPassword) {
    throw badRequest('Mật khẩu hiện tại không đúng');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
};
