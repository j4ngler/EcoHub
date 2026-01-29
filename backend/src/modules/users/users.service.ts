import bcrypt from 'bcryptjs';
import prisma from '../../config/database';
import { notFound, conflict, badRequest } from '../../middlewares/error.middleware';
import { getPagination } from '../../utils/helpers';
import { CreateUserDto, UpdateUserDto } from './users.dto';

interface GetUsersParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: string;
}

export const getUsers = async (params: GetUsersParams) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  if (params.search) {
    where.OR = [
      { username: { contains: params.search, mode: 'insensitive' } },
      { email: { contains: params.search, mode: 'insensitive' } },
      { fullName: { contains: params.search, mode: 'insensitive' } },
    ];
  }

  if (params.status) {
    where.status = params.status;
  }

  if (params.role) {
    where.userRoles = {
      some: {
        role: { name: params.role },
      },
    };
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
        shop: ur.shop ? { id: ur.shop.id, name: ur.shop.name } : null,
      })),
    })),
    total,
    page,
    limit,
  };
};

export const getUserById = async (id: string) => {
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
      shop: ur.shop ? { id: ur.shop.id, name: ur.shop.name, code: ur.shop.code } : null,
    })),
    permissions: Array.from(permissions),
  };
};

export const createUser = async (data: CreateUserDto, createdBy: string) => {
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

  return getUserById(user.id);
};

export const updateUser = async (id: string, data: UpdateUserDto) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
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

  return getUserById(id);
};

export const deleteUser = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  await prisma.user.delete({ where: { id } });
};

export const assignRole = async (
  userId: string,
  roleId: string,
  shopId: string | null,
  assignedBy: string
) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw notFound('Không tìm thấy người dùng');
  }

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) {
    throw notFound('Không tìm thấy vai trò');
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

  return getUserById(userId);
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
