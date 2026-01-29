import prisma from '../../config/database';
import { notFound, badRequest, forbidden } from '../../middlewares/error.middleware';
import { RoleName } from '@prisma/client';
import { getPagination, parseDateRange } from '../../utils/helpers';

interface GetVideosParams {
  page: number;
  limit: number;
  search?: string;
  orderId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
};

export const getVideos = async (params: GetVideosParams, currentUser?: CurrentUser) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  if (params.search) {
    where.OR = [
      { trackingCode: { contains: params.search, mode: 'insensitive' } },
      { order: { orderCode: { contains: params.search, mode: 'insensitive' } } },
    ];
  }

  if (params.orderId) {
    where.orderId = params.orderId;
  }

  if (params.status) {
    where.processingStatus = params.status;
  }

  // Nếu là customer, chỉ cho xem video của đơn hàng thuộc về chính mình
  if (currentUser?.roles.includes(RoleName.customer)) {
    where.order = {
      ...(where.order || {}),
      customerId: currentUser.userId,
    };
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  const [videos, total] = await Promise.all([
    prisma.packageVideo.findMany({
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
            status: true,
          },
        },
        recorder: { select: { id: true, fullName: true } },
        approver: { select: { id: true, fullName: true } },
      },
    }),
    prisma.packageVideo.count({ where }),
  ]);

  return {
    videos,
    total,
    page,
    limit,
  };
};

export const getVideoById = async (id: string, currentUser?: CurrentUser) => {
  const video = await prisma.packageVideo.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          items: true,
          carrier: true,
        },
      },
      recorder: { select: { id: true, fullName: true, email: true } },
      approver: { select: { id: true, fullName: true, email: true } },
      receivingVideos: true,
    },
  });

  if (!video) {
    throw notFound('Không tìm thấy video');
  }

  if (
    currentUser?.roles.includes(RoleName.customer) &&
    video.order &&
    // @ts-ignore customerId có trong quan hệ order (schema)
    (video.order as any).customerId &&
    // @ts-ignore
    (video.order as any).customerId !== currentUser.userId
  ) {
    throw forbidden('Bạn không được phép xem video của đơn hàng này');
  }

  return video;
};

export const getVideoByTrackingCode = async (trackingCode: string) => {
  const videos = await prisma.packageVideo.findMany({
    where: { 
      trackingCode,
      processingStatus: 'completed',
    },
    include: {
      order: {
        select: {
          orderCode: true,
          customerName: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return videos;
};

export const getVideosByOrder = async (orderId: string, currentUser?: CurrentUser) => {
  const videos = await prisma.packageVideo.findMany({
    where: { orderId },
    include: {
      recorder: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (currentUser?.roles.includes(RoleName.customer) && videos.length > 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order?.customerId && order.customerId !== currentUser.userId) {
      throw forbidden('Bạn không được phép xem video của đơn hàng này');
    }
  }

  return videos;
};

interface UploadPackageVideoParams {
  orderId: string;
  trackingCode: string;
  file: Express.Multer.File;
  recordedBy: string;
  trackingCodePosition?: string;
}

export const uploadPackageVideo = async (params: UploadPackageVideoParams) => {
  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Use order's tracking code if not provided
  const trackingCode = params.trackingCode || order.trackingCode;
  if (!trackingCode) {
    throw badRequest('Đơn hàng chưa có mã vận đơn');
  }

  // Create video record
  const video = await prisma.packageVideo.create({
    data: {
      orderId: params.orderId,
      trackingCode,
      originalVideoUrl: `/uploads/${params.file.filename}`,
      originalVideoSize: params.file.size,
      processingStatus: 'uploaded',
      trackingCodePosition: (params.trackingCodePosition as any) || 'bottom_right',
      recordedBy: params.recordedBy,
    },
  });

  // TODO: Queue video processing job to add tracking code overlay
  // For now, we'll just set processed URL same as original
  await prisma.packageVideo.update({
    where: { id: video.id },
    data: {
      processedVideoUrl: video.originalVideoUrl,
      processingStatus: 'completed',
    },
  });

  // Update order status if it's confirmed
  if (order.status === 'confirmed') {
    await prisma.order.update({
      where: { id: params.orderId },
      data: { status: 'packing' },
    });
  }

  return getVideoById(video.id);
};

export const approveVideo = async (id: string, approvedBy: string) => {
  const video = await prisma.packageVideo.findUnique({ where: { id } });
  if (!video) {
    throw notFound('Không tìm thấy video');
  }

  if (video.processingStatus !== 'completed') {
    throw badRequest('Video chưa được xử lý xong');
  }

  await prisma.packageVideo.update({
    where: { id },
    data: {
      approvedBy,
      approvedAt: new Date(),
    },
  });

  // Update order status to packed
  const order = await prisma.order.findUnique({ where: { id: video.orderId } });
  if (order && order.status === 'packing') {
    await prisma.order.update({
      where: { id: video.orderId },
      data: { 
        status: 'packed',
        packedAt: new Date(),
      },
    });
  }

  return getVideoById(id);
};

export const deleteVideo = async (id: string) => {
  const video = await prisma.packageVideo.findUnique({ where: { id } });
  if (!video) {
    throw notFound('Không tìm thấy video');
  }

  // TODO: Delete file from storage

  await prisma.packageVideo.delete({ where: { id } });
};

interface UploadReceivingVideoParams {
  orderId: string;
  trackingCode: string;
  file: Express.Multer.File;
  customerId: string;
}

export const uploadReceivingVideo = async (params: UploadReceivingVideoParams) => {
  const order = await prisma.order.findUnique({ where: { id: params.orderId } });
  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Find matching package video
  const packageVideo = await prisma.packageVideo.findFirst({
    where: { 
      orderId: params.orderId,
      processingStatus: 'completed',
    },
    orderBy: { createdAt: 'desc' },
  });

  const receivingVideo = await prisma.receivingVideo.create({
    data: {
      orderId: params.orderId,
      customerId: params.customerId,
      trackingCode: params.trackingCode || order.trackingCode!,
      videoUrl: `/uploads/${params.file.filename}`,
      videoSize: params.file.size,
      packageVideoId: packageVideo?.id,
      comparisonStatus: 'pending',
      recordedAt: new Date(),
    },
  });

  return receivingVideo;
};

export const compareVideos = async (packageVideoId: string) => {
  const packageVideo = await prisma.packageVideo.findUnique({
    where: { id: packageVideoId },
    include: {
      order: {
        select: { orderCode: true, customerName: true },
      },
      receivingVideos: {
        include: {
          customer: { select: { id: true, fullName: true } },
        },
      },
    },
  });

  if (!packageVideo) {
    throw notFound('Không tìm thấy video đóng gói');
  }

  return {
    packageVideo: {
      id: packageVideo.id,
      trackingCode: packageVideo.trackingCode,
      videoUrl: packageVideo.processedVideoUrl || packageVideo.originalVideoUrl,
      thumbnailUrl: packageVideo.thumbnailUrl,
      createdAt: packageVideo.createdAt,
    },
    receivingVideos: packageVideo.receivingVideos.map(rv => ({
      id: rv.id,
      videoUrl: rv.videoUrl,
      thumbnailUrl: rv.thumbnailUrl,
      comparisonStatus: rv.comparisonStatus,
      recordedAt: rv.recordedAt,
      customer: rv.customer,
    })),
    order: packageVideo.order,
  };
};
