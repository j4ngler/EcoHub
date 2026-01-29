import prisma from '../../config/database';
import { conflict, notFound, unauthorized, forbidden, badRequest } from '../../middlewares/error.middleware';
import { CreateShopDto } from './shops.dto';
import bcrypt from 'bcryptjs';

export const listShopsForUser = async (userId: string, roles: string[]) => {
  // Super admin: xem tất cả shop đang hoạt động
  if (roles.includes('super_admin')) {
    return prisma.shop.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        phone: true,
        email: true,
        address: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // User thường: chỉ shop đang hoạt động mà user có UserRole (scoped theo shop)
  const userRoles = await prisma.userRole.findMany({
    where: { userId, shopId: { not: null }, shop: { status: 'active' } },
    include: { shop: true, role: true },
  });

  const shopsMap = new Map<string, any>();
  for (const ur of userRoles) {
    if (!ur.shop) continue;
    const existing = shopsMap.get(ur.shop.id);
    if (!existing) {
      shopsMap.set(ur.shop.id, {
        id: ur.shop.id,
        name: ur.shop.name,
        code: ur.shop.code,
        phone: ur.shop.phone,
        email: ur.shop.email,
        address: ur.shop.address,
        ownerId: ur.shop.ownerId,
        createdAt: ur.shop.createdAt,
        updatedAt: ur.shop.updatedAt,
        role: ur.role.name,
      });
    } else if (existing.role !== 'super_admin') {
      // ưu tiên role "admin" nếu có
      if (ur.role.name === 'admin') existing.role = 'admin';
    }
  }

  return Array.from(shopsMap.values());
};

export const createShop = async (data: CreateShopDto) => {
  const existing = await prisma.shop.findUnique({ where: { code: data.code } });
  if (existing) throw conflict('Mã shop đã tồn tại');

  const existingAdminEmail = await prisma.user.findUnique({ where: { email: data.adminEmail } });
  if (existingAdminEmail) throw conflict('Email admin đã tồn tại');
  const existingAdminUsername = await prisma.user.findUnique({ where: { username: data.adminUsername } });
  if (existingAdminUsername) throw conflict('Tên đăng nhập admin đã tồn tại');

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) throw notFound('Không tìm thấy role admin');

  // Tạo user admin cho shop
  const adminUser = await prisma.user.create({
    data: {
      username: data.adminUsername,
      email: data.adminEmail,
      passwordHash: await bcrypt.hash(data.adminPassword, 12),
      fullName: data.adminFullName,
      phone: data.adminPhone ?? null,
      status: 'active',
    },
  });

  const shop = await prisma.shop.create({
    data: {
      name: data.name,
      code: data.code,
      ownerId: adminUser.id,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
    },
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      email: true,
      address: true,
      ownerId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Gán role admin scoped cho shop (nếu chưa có)
  await prisma.userRole.upsert({
    where: {
      userId_roleId_shopId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        shopId: shop.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      shopId: shop.id,
    },
  });

  return shop;
};

export const deleteShop = async (
  shopId: string,
  currentUserId: string,
  roles: string[],
  superAdminPassword: string
) => {
  // Chỉ Super Admin mới được xóa/khóa shop
  if (!roles.includes('super_admin')) {
    throw forbidden('Chỉ Super Admin mới được phép xóa shop');
  }

  const superAdmin = await prisma.user.findUnique({ where: { id: currentUserId } });
  if (!superAdmin) {
    throw unauthorized('Tài khoản không tồn tại');
  }

  const isValidPassword = await bcrypt.compare(superAdminPassword, superAdmin.passwordHash);
  if (!isValidPassword) {
    throw badRequest('Mật khẩu Super Admin không đúng');
  }

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw notFound('Không tìm thấy shop');
  }

  // Soft delete: chuyển shop sang trạng thái inactive để tránh lỗi ràng buộc dữ liệu
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      status: 'inactive',
    },
  });

  return { id: shopId };
};

