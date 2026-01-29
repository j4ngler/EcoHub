import prisma from '../../config/database';
import { conflict, notFound } from '../../middlewares/error.middleware';

export const getReportSubscriptions = async () => {
  return prisma.reportSubscription.findMany({
    orderBy: { createdAt: 'desc' },
  });
};

export const createReportSubscription = async (data: {
  email: string;
  reportType: 'financial' | 'operational' | 'both';
  enabled?: boolean;
}) => {
  // Check if already exists
  const existing = await prisma.reportSubscription.findUnique({
    where: {
      email_reportType: {
        email: data.email,
        reportType: data.reportType,
      },
    },
  });

  if (existing) {
    throw conflict('Email này đã đăng ký nhận loại báo cáo này');
  }

  return prisma.reportSubscription.create({
    data: {
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
  }
) => {
  const subscription = await prisma.reportSubscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    throw notFound('Không tìm thấy cấu hình email');
  }

  return prisma.reportSubscription.update({
    where: { id },
    data,
  });
};

export const deleteReportSubscription = async (id: string) => {
  const subscription = await prisma.reportSubscription.findUnique({
    where: { id },
  });

  if (!subscription) {
    throw notFound('Không tìm thấy cấu hình email');
  }

  await prisma.reportSubscription.delete({
    where: { id },
  });
};
