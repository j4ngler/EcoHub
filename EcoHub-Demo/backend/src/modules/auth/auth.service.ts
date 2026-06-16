import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { RoleName } from '@prisma/client';
import prisma from '../../config/database';
import { badRequest, conflict, notFound, unauthorized } from '../../middlewares/error.middleware';
import { RegisterDto } from './auth.dto';

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

const PUBLIC_REGISTER_ROLES: RoleName[] = [
  RoleName.staff,
  RoleName.customer_service,
  RoleName.customer,
];

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

const sanitizeUserForAuth = (
  user: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    phone?: string | null;
    avatarUrl?: string | null;
  },
  roles: RoleName[]
) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone || undefined,
  avatarUrl: user.avatarUrl || undefined,
  roles,
});

export const getRegisterOptions = async () => {
  const [shops, roles] = await Promise.all([
    prisma.shop.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, code: true },
    }),
    prisma.role.findMany({
      where: { name: { in: PUBLIC_REGISTER_ROLES } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, description: true },
    }),
  ]);

  return {
    roles,
    defaultShop: shops.length === 1 ? shops[0] : null,
    shopMode: shops.length === 1 ? 'single' : 'multiple',
  };
};

export const register = async (data: RegisterDto) => {
  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    throw conflict('Email đã được sử dụng');
  }

  const existingUsername = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (existingUsername) {
    throw conflict('Tên đăng nhập đã được sử dụng');
  }

  if (!PUBLIC_REGISTER_ROLES.includes(data.role as RoleName)) {
    throw badRequest('Không thể đăng ký vai trò này từ form công khai');
  }

  const role = await prisma.role.findUnique({
    where: { name: data.role as RoleName },
  });
  if (!role) {
    throw badRequest('Vai trò đăng ký chưa được cấu hình');
  }

  const activeShops = await prisma.shop.findMany({
    where: { status: 'active' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, code: true },
  });

  if (!activeShops.length) {
    throw notFound('Chưa có shop nội bộ để gán cho tài khoản đăng ký');
  }

  if (activeShops.length > 1) {
    throw badRequest('Hệ thống đang có nhiều shop hoạt động. Hãy dùng flow tạo user nội bộ thay vì đăng ký công khai');
  }

  const shop = activeShops[0];

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash,
      fullName: data.fullName,
      phone: data.phone,
      userRoles: {
        create: {
          roleId: role.id,
          shopId: shop.id,
        },
      },
    },
  });

  const roles: RoleName[] = [role.name];
  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    roles,
    shopId: shop.id,
    impersonating: false,
  });

  return {
    user: {
      ...sanitizeUserForAuth(user, roles),
      activeShop: {
        id: shop.id,
        name: shop.name,
        code: shop.code,
      },
      shops: [
        {
          id: shop.id,
          name: shop.name,
          code: shop.code,
          role: role.name,
        },
      ],
    },
    ...tokens,
  };
};

export const login = async (email: string, password: string) => {
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

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    throw unauthorized('Email hoặc mật khẩu không đúng');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const roles = user.userRoles.map((ur) => ur.role.name);
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const defaultShop = isSuperAdmin ? null : user.userRoles.find((ur) => ur.shop)?.shop || null;

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

  if (!shopId) {
    const roles = user.userRoles.map((ur) => ur.role.name);
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      roles,
      shopId: null,
      impersonating: false,
    });

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
  if (!targetShop) {
    throw notFound('Không tìm thấy shop');
  }

  const isSuperAdmin = user.userRoles.some((ur) => ur.role.name === RoleName.super_admin);
  const shopScopedRoles = user.userRoles.filter((ur) => ur.shopId === shopId).map((ur) => ur.role.name);
  const allowed = isSuperAdmin || shopScopedRoles.length > 0;
  if (!allowed) {
    throw unauthorized('Bạn không có quyền quản lý shop này');
  }

  let effectiveRoles: RoleName[] = shopScopedRoles.length > 0 ? shopScopedRoles : [RoleName.admin];
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

    const roles = user.userRoles.map((ur) => ur.role.name);
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

export const getMe = async (userId: string, activeShopId?: string | null) => {
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

  const roles = user.userRoles.map((ur) => ur.role.name);
  const permissions = new Set<string>();
  user.userRoles.forEach((ur) => {
    ur.role.permissions.forEach((rp) => {
      permissions.add(rp.permission.name);
    });
  });

  const activeShop = activeShopId
    ? user.userRoles.find((ur) => ur.shop?.id === activeShopId)?.shop || null
    : null;

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
    activeShop: activeShop
      ? { id: activeShop.id, name: activeShop.name, code: activeShop.code }
      : null,
    shops: user.userRoles
      .filter((ur) => ur.shop)
      .map((ur) => ({
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

  const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValidPassword) {
    throw badRequest('Mật khẩu hiện tại không đúng');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
};
