import prisma from '../../config/database';

export const getRoles = async () => {
  const roles = await prisma.role.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, description: true },
  });
  return roles;
};

export const getShops = async (params?: { userId?: string; roles?: string[] }) => {
  const roles = params?.roles || [];
  const isElevated = roles.includes('super_admin') || roles.includes('admin');

  if (!params?.userId || isElevated) {
    return prisma.shop.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, code: true, status: true, phone: true, email: true, address: true },
    });
  }

  const assignedShopIds = await prisma.userRole.findMany({
    where: {
      userId: params.userId,
      shopId: { not: null },
      shop: { status: 'active' },
    },
    select: { shopId: true },
    distinct: ['shopId'],
  });

  const shopIds = assignedShopIds
    .map((item) => item.shopId)
    .filter((shopId): shopId is string => Boolean(shopId));

  if (!shopIds.length) {
    return [];
  }

  return prisma.shop.findMany({
    where: { status: 'active', id: { in: shopIds } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, code: true, status: true, phone: true, email: true, address: true },
  });
};
