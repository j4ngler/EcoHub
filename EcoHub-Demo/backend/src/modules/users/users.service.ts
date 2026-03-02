import bcrypt from 'bcryptjs';
import prisma from '../../config/database';
import { notFound, conflict, badRequest, forbidden } from '../../middlewares/error.middleware';
import { getPagination } from '../../utils/helpers';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { RoleName } from '@prisma/client';

interface GetUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

const SHOP_VISIBLE_ROLES: RoleName[] = [RoleName.admin, RoleName.staff, RoleName.customer_service, RoleName.customer];

export const getUsers = async (params: GetUsersParams, currentUser?: CurrentUser) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  try {
    const where: any = {};

    if (params.search && params.search.trim()) {
      const term = params.search.trim();
      where.OR = [
        { username: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { fullName: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (params.status) {
      where.status = params.status;
    }

    const activeShopId = currentUser?.shopId ?? null;
    const isSuperAdmin = currentUser?.roles?.includes(RoleName.super_admin) ?? false;
    if (activeShopId) {
      // Super Admin khi assume shop: thấy tất cả users trong shop đó
      // Admin/Staff thông thường: chỉ thấy users có role trong SHOP_VISIBLE_ROLES
      if (isSuperAdmin) {
        where.userRoles = {
          some: {
            shopId: activeShopId,
          },
        };
      } else {
        where.userRoles = {
          some: {
            shopId: activeShopId,
            role: { name: { in: SHOP_VISIBLE_ROLES } },
          },
        };
      }
    }

    // Chỉ dùng filter role nếu giá trị hợp lệ (tránh Prisma throw do enum không tồn tại)
    const validRoleNames = Object.values(RoleName) as string[];
    if (params.role && validRoleNames.includes(params.role)) {
      // Super Admin có thể filter theo bất kỳ role nào, Admin/Staff chỉ filter theo SHOP_VISIBLE_ROLES
      if (activeShopId && !isSuperAdmin && !SHOP_VISIBLE_ROLES.includes(params.role as RoleName)) {
        return { users: [], total: 0, page, limit };
      }
      // Nếu đã có filter shop ở trên, cần merge với filter role
      if (activeShopId && where.userRoles) {
        // Merge: user phải có role này VÀ trong shop này
        where.userRoles = {
          some: {
            shopId: activeShopId,
            role: { name: params.role as RoleName },
          },
        };
      } else {
        where.userRoles = {
          some: {
            ...(activeShopId ? { shopId: activeShopId } : {}),
            role: { name: params.role as RoleName },
          },
        };
      }
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userRoles: {
            include: {
              role: true,
              shop: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(user => ({
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
        roles: user.userRoles.map(ur => ({
          id: ur.role.id,
          name: ur.role.name,
          shop: ur.shop && ur.shop.status === 'active' ? { id: ur.shop.id, name: ur.shop.name } : null,
        })),
      })),
      total,
      page,
      limit,
    };
  } catch (err) {
    console.error('[getUsers]', err);
    return { users: [], total: 0, page, limit };
  }
};

export const getUserById = async (id: string, currentUser?: CurrentUser) => {
  const user = await prisma.user.findUnique({
    where: { id },
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

  const activeShopId = currentUser?.shopId ?? null;
  const isSuperAdmin = currentUser?.roles?.includes(RoleName.super_admin) ?? false;
  // Super Admin luôn được xem mọi user (kể cả khi assume shop)
  if (activeShopId && !isSuperAdmin) {
    const belongsToShop = user.userRoles.some(
      (ur) => ur.shopId === activeShopId && SHOP_VISIBLE_ROLES.includes(ur.role.name)
    );
    if (!belongsToShop) {
      throw forbidden('Bạn chỉ được xem người dùng thuộc shop đang quản lý');
    }
  }

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
    updatedAt: user.updatedAt,
    roles: user.userRoles.map(ur => ({
      id: ur.role.id,
      name: ur.role.name,
      description: ur.role.description,
      shop: ur.shop && ur.shop.status === 'active' ? { id: ur.shop.id, name: ur.shop.name, code: ur.shop.code } : null,
    })),
    permissions: Array.from(permissions),
  };
};

export const createUser = async (data: CreateUserDto, createdBy: string, currentUser?: CurrentUser) => {
  // Validate shop sớm (tránh tạo user rồi mới fail)
  const activeShopId = currentUser?.shopId ?? null;
  if (activeShopId) {
    if (data.shopId && data.shopId !== activeShopId) {
      throw badRequest('Không được tạo người dùng cho shop khác khi đang quản lý shop hiện tại');
    }
    data.shopId = activeShopId;
  }
  if (!data.shopId) {
    throw badRequest('Vui lòng chọn shop');
  }

  // Check email
  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) {
    throw conflict('Email đã được sử dụng');
  }

  // Check username
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
      status: data.status || 'active',
    },
  });

  // Assign role if provided
  if (activeShopId) {
    // Trong chế độ quản lý shop: bắt buộc gán vai trò và chỉ được tạo user thuộc đúng shop đang quản lý,
    // Cho phép tạo: staff, customer_service, customer (không cho phép admin hoặc super_admin)
    if (!data.roleId) {
      throw badRequest('Khi đang quản lý shop, vui lòng chọn vai trò cho người dùng');
    }

    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw notFound('Không tìm thấy vai trò');
    
    // Chỉ cho phép tạo các role thuộc shop (không cho phép admin/super_admin)
    const allowedRoles = [RoleName.staff, RoleName.customer_service, RoleName.customer];
    if (!allowedRoles.includes(role.name)) {
      throw badRequest('Trong shop chỉ được tạo tài khoản Nhân viên, Nhân viên chăm sóc khách hàng hoặc Khách hàng');
    }
  }

  if (data.roleId) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: data.roleId,
        shopId: data.shopId,
        assignedBy: createdBy,
      },
    });
  }

  // Sau khi tạo user và role, query lại để trả về đầy đủ thông tin
  // Super Admin luôn được phép xem user mới tạo (đã sửa trong getUserById)
  try {
    return await getUserById(user.id, currentUser);
  } catch (error: any) {
    // Nếu getUserById fail (có thể do permission check), vẫn trả về user cơ bản
    // nhưng log lỗi để debug
    console.error('[createUser] getUserById failed after creating user:', error?.message || error);
    // Trả về user cơ bản với thông tin role đã tạo
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
      updatedAt: user.updatedAt,
      roles: data.roleId ? [{
        id: data.roleId,
        name: 'unknown', // Sẽ được load lại ở lần query tiếp theo
        description: null,
        shop: data.shopId ? { id: data.shopId, name: '', code: '' } : null,
      }] : [],
      permissions: [],
    };
  }
};

export const updateUser = async (id: string, data: UpdateUserDto, currentUser?: CurrentUser) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  const activeShopId = currentUser?.shopId ?? null;
  if (activeShopId) {
    const userRoles = await prisma.userRole.findMany({
      where: { userId: id, shopId: activeShopId },
      include: { role: true },
    });
    const ok = userRoles.some((ur) => SHOP_VISIBLE_ROLES.includes(ur.role.name));
    if (!ok) throw forbidden('Bạn chỉ được cập nhật người dùng thuộc shop đang quản lý');
  }

  // Check email if changed
  if (data.email && data.email !== user.email) {
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      throw conflict('Email đã được sử dụng');
    }
  }

  const updateData: any = {};
  if (data.fullName) updateData.fullName = data.fullName;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
  if (data.status) updateData.status = data.status;
  if (data.email) updateData.email = data.email;

  if (data.password) {
    updateData.passwordHash = await bcrypt.hash(data.password, 12);
  }

  await prisma.user.update({
    where: { id },
    data: updateData,
  });

  return getUserById(id, currentUser);
};

export const deleteUser = async (id: string, options?: { transferShopToUserId?: string }) => {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      ownedShops: { select: { id: true, name: true, status: true } },
    },
  });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  let transferTo = options?.transferShopToUserId?.trim();

  // Nếu user là chủ shop nhưng chưa chỉ định user nhận: thử chuyển sang một super_admin khác
  if (user.ownedShops.length > 0 && !transferTo) {
    const superAdminRole = await prisma.role.findUnique({ where: { name: RoleName.super_admin } });
    if (superAdminRole) {
      const otherSuperAdmin = await prisma.userRole.findFirst({
        where: { roleId: superAdminRole.id, userId: { not: id } },
        select: { userId: true },
      });
      if (otherSuperAdmin) {
        transferTo = otherSuperAdmin.userId;
      }
    }
    if (!transferTo) {
      const names = user.ownedShops.map((s) => s.name).join(', ');
      throw badRequest(
        `Không thể xóa người dùng đang là chủ shop (${names}). Cần ít nhất một Super Admin khác để chuyển shop; hoặc chọn "Chuyển shop sang user khác" trong modal và chọn user nhận.`
      );
    }
  }

  if (transferTo) {
    if (transferTo === id) {
      throw badRequest('Không thể chuyển shop sang chính user đang xóa.');
    }
    const targetUser = await prisma.user.findUnique({ where: { id: transferTo } });
    if (!targetUser) {
      throw notFound('Không tìm thấy user nhận shop.');
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Chuyển toàn bộ shop của user sang user khác (nếu có) để tránh FK shops.owner_id RESTRICT
      if (transferTo) {
        await tx.shop.updateMany({ where: { ownerId: id }, data: { ownerId: transferTo } });
      }

      // Set các FK tùy chọn về null để bỏ tham chiếu tới user
      await tx.order.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
      await tx.orderStatusHistory.updateMany({ where: { changedBy: id }, data: { changedBy: null } });
      await tx.packageVideo.updateMany({ where: { approvedBy: id }, data: { approvedBy: null } });
      await tx.product.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
      await tx.inventoryTransaction.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
      await tx.userRole.updateMany({ where: { assignedBy: id }, data: { assignedBy: null } });
      await tx.returnRequest.updateMany({ where: { reviewedBy: id }, data: { reviewedBy: null } });

      // Gỡ liên kết ReceivingVideo -> PackageVideo trước khi xóa PackageVideo (tránh FK khi xóa)
      const packageVideoIds = await tx.packageVideo.findMany({ where: { recordedBy: id }, select: { id: true } });
      if (packageVideoIds.length > 0) {
        await tx.receivingVideo.updateMany({
          where: { packageVideoId: { in: packageVideoIds.map((p) => p.id) } },
          data: { packageVideoId: null },
        });
      }

      // Xóa bản ghi phụ thuộc bắt buộc (FK required) trước khi xóa User
      await tx.receivingVideo.deleteMany({ where: { customerId: id } });
      await tx.packageVideo.deleteMany({ where: { recordedBy: id } });
      await tx.returnRequest.deleteMany({ where: { customerId: id } });

      // UserRole và Notification có onDelete: Cascade khi xóa User
      await tx.user.delete({ where: { id } });
    });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === 'development') {
      console.error('[deleteUser] Transaction failed:', err);
    }
    const prismaErr = err as { code?: string; message?: string };
    const isFk =
      prismaErr?.code === 'P2003' ||
      (err instanceof Error && err.message?.toLowerCase().includes('foreign key'));
    if (isFk) {
      // Luôn trả chi tiết lỗi để UI hiển thị (giúp xác định bảng/FK gây lỗi)
      throw badRequest(
        `Không thể xóa người dùng do còn dữ liệu liên quan. Chi tiết: ${detail}`
      );
    }
    throw err;
  }
};

export const assignRole = async (
  userId: string,
  roleId: string,
  shopId: string | null,
  assignedBy: string
, currentUser?: CurrentUser
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw notFound('Không tìm thấy vai trò');
  }

  const activeShopId = currentUser?.shopId ?? null;
  if (activeShopId) {
    // chỉ gán role trong đúng shop đang quản lý
    shopId = activeShopId;
    if (!SHOP_VISIBLE_ROLES.includes(role.name)) {
      throw badRequest('Không được gán vai trò này trong phạm vi shop');
    }
  }

  // Check if already has this role
  const existingRole = await prisma.userRole.findFirst({
    where: { userId, roleId, shopId },
  });
  if (existingRole) {
    throw conflict('Người dùng đã có vai trò này');
  }

  await prisma.userRole.create({
    data: {
      userId,
      roleId,
      shopId,
      assignedBy,
    },
  });

  return getUserById(userId, currentUser);
};

export const removeRole = async (userId: string, roleId: string) => {
  const userRole = await prisma.userRole.findFirst({
    where: { userId, roleId },
  });

  if (!userRole) {
    throw notFound('Không tìm thấy vai trò của người dùng');
  }

  await prisma.userRole.delete({ where: { id: userRole.id } });
};