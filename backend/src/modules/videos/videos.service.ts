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
  showDeleted?: boolean;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

export const getVideos = async (params: GetVideosParams, currentUser?: CurrentUser) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};
  
  // Nếu không yêu cầu hiển thị video đã xóa, chỉ lấy video chưa bị xóa
  if (!params.showDeleted) {
    where.deletedAt = null;
  }

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

  // Nếu đang quản lý một shop cụ thể (impersonate / admin shop) thì chỉ xem video của shop đó
  if (currentUser?.shopId) {
    where.order = {
      ...(where.order || {}),
      shopId: currentUser.shopId,
    };
  }

  // Nếu là nhân viên (staff) nhưng KHÔNG phải admin/super_admin
  // => chỉ xem được những video do chính mình quay (recordedBy)
  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin);

  if (!isAdminLike && currentUser?.roles.includes(RoleName.staff)) {
    where.recordedBy = currentUser.userId;
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

  // Nếu đang ở ngữ cảnh shop thì chỉ xem video của đơn thuộc shop đó
  if (currentUser?.shopId) {
    const order = await prisma.order.findUnique({ where: { id: video.orderId } });
    if (order && order.shopId !== currentUser.shopId) {
      throw forbidden('Bạn không được phép xem video của shop khác');
    }
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

  // Nhân viên đóng gói chỉ được xem video do chính mình quay
  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin);

  if (!isAdminLike && currentUser?.roles.includes(RoleName.staff)) {
    if (video.recordedBy !== currentUser.userId) {
      throw forbidden('Bạn chỉ được phép xem video do mình quay');
    }
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
  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin);

  const where: any = { orderId };

  // Nhân viên chỉ xem được video do mình quay trong đơn đó
  if (!isAdminLike && currentUser?.roles.includes(RoleName.staff)) {
    where.recordedBy = currentUser.userId;
  }

  const videos = await prisma.packageVideo.findMany({
    where,
    include: {
      recorder: { select: { id: true, fullName: true } },
      approver: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (videos.length > 0) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    // Nếu là customer: chỉ xem video của đơn hàng của chính mình
    if (currentUser?.roles.includes(RoleName.customer) && order?.customerId && order.customerId !== currentUser.userId) {
      throw forbidden('Bạn không được phép xem video của đơn hàng này');
    }

    // Nếu đang ở ngữ cảnh shop: chỉ xem video của đơn thuộc shop đó
    if (currentUser?.shopId && order && order.shopId !== currentUser.shopId) {
      throw forbidden('Bạn không được phép xem video của shop khác');
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

  // Create video record - auto mark as completed & approved
  const video = await prisma.packageVideo.create({
    data: {
      orderId: params.orderId,
      trackingCode,
      originalVideoUrl: `/uploads/${params.file.filename}`,
      originalVideoSize: params.file.size,
      // Video được xử lý xong ngay (demo) và coi như đã phê duyệt
      processingStatus: 'completed',
      processedVideoUrl: `/uploads/${params.file.filename}`,
      trackingCodePosition: (params.trackingCodePosition as any) || 'bottom_right',
      recordedBy: params.recordedBy,
      approvedBy: params.recordedBy,
      approvedAt: new Date(),
    },
  });

  // Update order status to packed + packedAt khi đã có video
  if (order.status === 'confirmed' || order.status === 'packing') {
    await prisma.order.update({
      where: { id: params.orderId },
      data: {
        status: 'packed',
        packedAt: new Date(),
      },
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

  // Soft delete - chỉ đánh dấu đã xóa, không xóa thật
  await prisma.packageVideo.update({
    where: { id },
    data: {
      deletedAt: new Date(),
    },
  });
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
