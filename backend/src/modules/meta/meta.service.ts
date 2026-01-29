import prisma from '../../config/database';

export const getRoles = async () => {
  const roles = await prisma.role.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, description: true },
  });
  return roles;
};

export const getShops = async () => {
  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, code: true, status: true, phone: true, email: true, address: true },
  });
  return shops;
};

