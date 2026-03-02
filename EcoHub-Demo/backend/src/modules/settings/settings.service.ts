import prisma from '../../config/database';
import { badRequest, conflict, notFound } from '../../middlewares/error.middleware';

/** Chỉ trả về đăng ký báo cáo của đúng shop (shop nào cài thì shop đó mới thấy). */
export const getReportSubscriptions = async (shopId: string | null) => {
  if (!shopId) return [];
  const shopExists = await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shopExists) return [];
  return prisma.reportSubscription.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
  });
};

export const createReportSubscription = async (
  data: {
    email: string;
    reportType: 'financial' | 'operational' | 'both';
    enabled?: boolean;
    shopId?: string;
  },
  shopIdFromContext: string | null
) => {
  const shopId = data.shopId || shopIdFromContext;
  if (!shopId) {
    throw badRequest('Vui lòng chọn shop hoặc vào ngữ cảnh shop trước khi thêm email nhận báo cáo');
  }

  const existing = await prisma.reportSubscription.findFirst({
    where: {
      shopId,
      email: data.email,
      reportType: data.reportType,
    },
  });

  if (existing) {
    throw conflict('Email này đã đăng ký nhận loại báo cáo này trong shop');
  }

  return prisma.reportSubscription.create({
    data: {
      shopId,
      email: data.email,
      reportType: data.reportType,
      enabled: data.enabled !== undefined ? data.enabled : true,
    },
  });
};

export const updateReportSubscription = async (
  id: string,
  data: {
    enabled?: boolean;
    reportType?: 'financial' | 'operational' | 'both';
  },
  shopId: string | null
) => {
  const subscription = await prisma.reportSubscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    throw notFound('Không tìm thấy cấu hình email');
  }
  if (shopId && subscription.shopId !== shopId) {
    throw notFound('Chỉ được sửa cấu hình thuộc shop hiện tại');
  }

  return prisma.reportSubscription.update({
    where: { id },
    data,
  });
};

export const deleteReportSubscription = async (id: string, shopId: string | null) => {
  const subscription = await prisma.reportSubscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    throw notFound('Không tìm thấy cấu hình email');
  }
  if (shopId && subscription.shopId !== shopId) {
    throw notFound('Chỉ được xóa cấu hình thuộc shop hiện tại');
  }

  await prisma.reportSubscription.delete({
    where: { id },
  });
};
