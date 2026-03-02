import prisma from '../../config/database';
import { conflict, notFound, unauthorized, forbidden, badRequest } from '../../middlewares/error.middleware';
import { CreateShopDto } from './shops.dto';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

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

  // Lấy tất cả video liên quan đến shop để xóa file trên đĩa
  const orders = await prisma.order.findMany({
    where: { shopId },
    select: {
      id: true,
      packageVideos: {
        select: {
          originalVideoUrl: true,
          processedVideoUrl: true,
          thumbnailUrl: true,
        },
      },
      receivingVideos: {
        select: {
          videoUrl: true,
          thumbnailUrl: true,
        },
      },
    },
  });

  // Xóa file video trên đĩa
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  const filesToDelete = new Set<string>();

  for (const order of orders) {
    // Package videos
    for (const video of order.packageVideos) {
      if (video.originalVideoUrl) {
        const filename = video.originalVideoUrl.replace('/uploads/', '');
        if (filename) filesToDelete.add(filename);
      }
      if (video.processedVideoUrl) {
        const filename = video.processedVideoUrl.replace('/uploads/', '');
        if (filename) filesToDelete.add(filename);
      }
      if (video.thumbnailUrl) {
        const filename = video.thumbnailUrl.replace('/uploads/', '');
        if (filename) filesToDelete.add(filename);
      }
    }
    // Receiving videos
    for (const video of order.receivingVideos) {
      if (video.videoUrl) {
        const filename = video.videoUrl.replace('/uploads/', '');
        if (filename) filesToDelete.add(filename);
      }
      if (video.thumbnailUrl) {
        const filename = video.thumbnailUrl.replace('/uploads/', '');
        if (filename) filesToDelete.add(filename);
      }
    }
  }

  // Xóa file trên đĩa (không throw error nếu file không tồn tại)
  for (const filename of filesToDelete) {
    try {
      const filePath = path.join(uploadsDir, filename);
      await fs.unlink(filePath);
    } catch (err: any) {
      // Bỏ qua lỗi nếu file không tồn tại
      if (err?.code !== 'ENOENT') {
        console.error(`Lỗi khi xóa file ${filename}:`, err);
      }
    }
  }

  // Xóa tất cả dữ liệu liên quan trong database bằng transaction
  await prisma.$transaction(async (tx: any) => {
    // 1. Xóa ReceivingVideo (liên quan đến Order)
    await tx.receivingVideo.deleteMany({
      where: { order: { shopId } },
    });

    // 2. Xóa PackageVideo (liên quan đến Order)
    await tx.packageVideo.deleteMany({
      where: { order: { shopId } },
    });

    // 3. Xóa ReturnRequest (liên quan đến Order)
    await tx.returnRequest.deleteMany({
      where: { order: { shopId } },
    });

    // 4. Xóa OrderStatusHistory (liên quan đến Order)
    await tx.orderStatusHistory.deleteMany({
      where: { order: { shopId } },
    });

    // 5. Xóa OrderItem (liên quan đến Order)
    await tx.orderItem.deleteMany({
      where: { order: { shopId } },
    });

    // 6. Xóa Order
    await tx.order.deleteMany({
      where: { shopId },
    });

    // 7. Xóa InventoryTransaction (liên quan đến Warehouse và Product)
    await tx.inventoryTransaction.deleteMany({
      where: {
        OR: [
          { warehouse: { shopId } },
          { product: { shopId } },
        ],
      },
    });

    // 8. Xóa Product (cascade sẽ xóa OrderItem liên quan, nhưng đã xóa ở trên)
    await tx.product.deleteMany({
      where: { shopId },
    });

    // 9. Xóa ProductCategory
    await tx.productCategory.deleteMany({
      where: { shopId },
    });

    // 10. Xóa Warehouse (cascade sẽ xóa InventoryTransaction, nhưng đã xóa ở trên)
    await tx.warehouse.deleteMany({
      where: { shopId },
    });

    // 11. Xóa ShopCarrierSetting
    await tx.shopCarrierSetting.deleteMany({
      where: { shopId },
    });

    // 12. Xóa ShopChannelConnection
    await tx.shopChannelConnection.deleteMany({
      where: { shopId },
    });

    // 13. Xóa UserRole liên quan đến shop
    await tx.userRole.deleteMany({
      where: { shopId },
    });

    // 14. Cuối cùng xóa Shop
    await tx.shop.delete({
      where: { id: shopId },
    });
  });

  return { id: shopId };
};

