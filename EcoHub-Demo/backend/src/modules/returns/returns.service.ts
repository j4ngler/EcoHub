import prisma from '../../config/database';
import { notFound, badRequest } from '../../middlewares/error.middleware';
import { getPagination } from '../../utils/helpers';
import { CreateReturnDto } from './returns.dto';

interface GetReturnsParams {
  page: number;
  limit: number;
  status?: string;
  orderId?: string;
}

export const getReturns = async (params: GetReturnsParams) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  if (params.status) {
    where.status = params.status;
  }

  if (params.orderId) {
    where.orderId = params.orderId;
  }

  const [returns, total] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            customerName: true,
            totalAmount: true,
          },
        },
        customer: { select: { id: true, fullName: true, email: true } },
        reviewer: { select: { id: true, fullName: true } },
      },
    }),
    prisma.returnRequest.count({ where }),
  ]);

  return {
    returns,
    total,
    page,
    limit,
  };
};

export const getReturnById = async (id: string) => {
  const returnRequest = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          items: true,
          packageVideos: {
            where: { processingStatus: 'completed' },
            select: {
              id: true,
              processedVideoUrl: true,
              thumbnailUrl: true,
            },
          },
        },
      },
      customer: { select: { id: true, fullName: true, email: true, phone: true } },
      reviewer: { select: { id: true, fullName: true } },
    },
  });

  if (!returnRequest) {
    throw notFound('Không tìm thấy yêu cầu hoàn trả');
  }

  return returnRequest;
};

export const createReturn = async (data: CreateReturnDto & { customerId: string }) => {
  const order = await prisma.order.findUnique({ where: { id: data.orderId } });
  
  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Check if order can be returned (delivered or completed)
  if (!['delivered', 'completed'].includes(order.status)) {
    throw badRequest('Chỉ có thể hoàn trả đơn hàng đã giao');
  }

  // Check if already has pending return
  const existingReturn = await prisma.returnRequest.findFirst({
    where: {
      orderId: data.orderId,
      status: { in: ['pending', 'approved', 'processing'] },
    },
  });

  if (existingReturn) {
    throw badRequest('Đơn hàng này đã có yêu cầu hoàn trả đang xử lý');
  }

  const returnRequest = await prisma.returnRequest.create({
    data: {
      orderId: data.orderId,
      customerId: data.customerId,
      reason: data.reason,
      description: data.description,
      images: data.images,
    },
  });

  return getReturnById(returnRequest.id);
};

export const approveReturn = async (
  id: string,
  reviewedBy: string,
  refundAmount: number,
  notes?: string
) => {
  const returnRequest = await prisma.returnRequest.findUnique({ where: { id } });
  
  if (!returnRequest) {
    throw notFound('Không tìm thấy yêu cầu hoàn trả');
  }

  if (returnRequest.status !== 'pending') {
    throw badRequest('Yêu cầu này đã được xử lý');
  }

  await prisma.returnRequest.update({
    where: { id },
    data: {
      status: 'approved',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: notes,
      refundAmount,
    },
  });

  // Update order status
  await prisma.order.update({
    where: { id: returnRequest.orderId },
    data: { status: 'returned' },
  });

  return getReturnById(id);
};

export const rejectReturn = async (id: string, reviewedBy: string, notes?: string) => {
  const returnRequest = await prisma.returnRequest.findUnique({ where: { id } });
  
  if (!returnRequest) {
    throw notFound('Không tìm thấy yêu cầu hoàn trả');
  }

  if (returnRequest.status !== 'pending') {
    throw badRequest('Yêu cầu này đã được xử lý');
  }

  await prisma.returnRequest.update({
    where: { id },
    data: {
      status: 'rejected',
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: notes,
    },
  });

  return getReturnById(id);
};

export const completeReturn = async (id: string) => {
  const returnRequest = await prisma.returnRequest.findUnique({ where: { id } });
  
  if (!returnRequest) {
    throw notFound('Không tìm thấy yêu cầu hoàn trả');
  }

  if (returnRequest.status !== 'approved') {
    throw badRequest('Chỉ có thể hoàn tất yêu cầu đã được duyệt');
  }

  await prisma.returnRequest.update({
    where: { id },
    data: {
      status: 'completed',
      refundedAt: new Date(),
    },
  });

  return getReturnById(id);
};
