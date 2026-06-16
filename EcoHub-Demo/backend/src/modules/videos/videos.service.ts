import fs from 'fs/promises';
import path from 'path';
import prisma from '../../config/database';
import { notFound, badRequest, forbidden } from '../../middlewares/error.middleware';
import { RoleName } from '@prisma/client';
import { getPagination, parseDateRange } from '../../utils/helpers';
import { getS3ProxyUrl, uploadFileToS3 } from '../../services/s3.service';
import { compressVideoFile } from './video-processing.service';

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

interface GetReceivingVideosParams {
  page: number;
  limit: number;
  search?: string;
  orderId?: string;
  comparisonStatus?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

type StoredVideoAsset = {
  originalUrl: string;
  originalSize: number;
  processedUrl: string;
  processedSize: number;
  durationSec?: number | null;
  processingError?: string | null;
  localPaths: string[];
};

const sanitizeS3Segment = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';

const buildStoredVideoKey = (params: {
  module: 'packaging' | 'receiving';
  orderId: string;
  trackingCode: string;
  kind: 'original' | 'processed';
  extension: string;
}) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(36).slice(2, 8);

  return [
    'videos',
    params.module,
    sanitizeS3Segment(params.orderId),
    sanitizeS3Segment(params.trackingCode),
    params.kind,
    `${timestamp}_${random}.${sanitizeS3Segment(params.extension)}`,
  ].join('/');
};

const getFileExtension = (filePath: string, fallback = 'mp4') => {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return ext || fallback;
};

const uploadVideoAssetToS3 = async (params: {
  file: Express.Multer.File;
  module: 'packaging' | 'receiving';
  orderId: string;
  trackingCode: string;
}): Promise<StoredVideoAsset> => {
  const compressed = await compressVideoFile(params.file.path);
  const processedKey = buildStoredVideoKey({
    module: params.module,
    orderId: params.orderId,
    trackingCode: params.trackingCode,
    kind: compressed.outputPath === params.file.path ? 'original' : 'processed',
    extension: getFileExtension(compressed.outputPath, getFileExtension(params.file.originalname || params.file.path)),
  });

  await uploadFileToS3({
    key: processedKey,
    filePath: compressed.outputPath,
    contentType: compressed.outputPath === params.file.path ? params.file.mimetype || 'application/octet-stream' : 'video/mp4',
  });

  const storedUrl = getS3ProxyUrl(processedKey);

  return {
    originalUrl: storedUrl,
    originalSize: params.file.size,
    processedUrl: storedUrl,
    processedSize: compressed.sizeBytes,
    durationSec: compressed.durationSec ?? null,
    processingError: compressed.processingError ?? null,
    localPaths: Array.from(new Set([params.file.path, compressed.outputPath])),
  };
};

const cleanupLocalFiles = async (paths: string[]) => {
  await Promise.all(paths.map((filePath) => fs.rm(filePath, { force: true }).catch(() => undefined)));
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

  // Admin / Super Admin / CSKH: xem tất cả video trong shop. Staff: chỉ xem video do mình quay
  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin) ||
    currentUser?.roles.includes(RoleName.customer_service);

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

export const getReceivingVideos = async (
  params: GetReceivingVideosParams,
  currentUser?: CurrentUser
) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {
    deletedAt: null,
  };

  if (params.orderId) {
    where.orderId = params.orderId;
  }

  if (params.comparisonStatus) {
    where.comparisonStatus = params.comparisonStatus;
  }

  if (params.search) {
    where.OR = [
      { trackingCode: { contains: params.search, mode: 'insensitive' } },
      { order: { orderCode: { contains: params.search, mode: 'insensitive' } } },
      { customer: { fullName: { contains: params.search, mode: 'insensitive' } } },
    ];
  }

  if (currentUser?.roles.includes(RoleName.customer)) {
    where.customerId = currentUser.userId;
  }

  if (currentUser?.shopId) {
    where.order = {
      ...(where.order || {}),
      shopId: currentUser.shopId,
    };
  }

  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin) ||
    currentUser?.roles.includes(RoleName.customer_service);

  if (!isAdminLike && currentUser?.roles.includes(RoleName.staff)) {
    where.packageVideo = {
      recordedBy: currentUser.userId,
    };
  }

  const [videos, total] = await Promise.all([
    prisma.receivingVideo.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ recordedAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            customerName: true,
            status: true,
            trackingCode: true,
          },
        },
        customer: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        packageVideo: {
          select: {
            id: true,
            trackingCode: true,
            processedVideoUrl: true,
            originalVideoUrl: true,
          },
        },
      },
    }),
    prisma.receivingVideo.count({ where }),
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

  // Admin / Super Admin / CSKH: xem mọi video. Nhân viên đóng gói chỉ xem video do mình quay
  const isAdminLike =
    currentUser?.roles.includes(RoleName.admin) ||
    currentUser?.roles.includes(RoleName.super_admin) ||
    currentUser?.roles.includes(RoleName.customer_service);

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
    currentUser?.roles.includes(RoleName.super_admin) ||
    currentUser?.roles.includes(RoleName.customer_service);

  const where: any = { orderId };

  // Nhân viên đóng gói chỉ xem video do mình quay; Admin/CSKH xem tất cả
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

  const storedVideo = await uploadVideoAssetToS3({
    file: params.file,
    module: 'packaging',
    orderId: params.orderId,
    trackingCode,
  });

  const video = await prisma.packageVideo.create({
    data: {
      orderId: params.orderId,
      trackingCode,
      originalVideoUrl: storedVideo.originalUrl,
      originalVideoSize: BigInt(storedVideo.originalSize),
      originalDuration: storedVideo.durationSec ?? null,
      // Video được nén xong ngay sau khi upload và được duyệt bởi người ghi hình hiện tại.
      processingStatus: 'completed',
      processedVideoUrl: storedVideo.processedUrl,
      processedVideoSize: BigInt(storedVideo.processedSize),
      processingError: storedVideo.processingError || null,
      trackingCodePosition: (params.trackingCodePosition as any) || 'bottom_right',
      recordedBy: params.recordedBy,
      approvedBy: params.recordedBy,
      approvedAt: new Date(),
    },
  });

  await cleanupLocalFiles(storedVideo.localPaths);

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

  const trackingCode = params.trackingCode || order.trackingCode!;
  const storedVideo = await uploadVideoAssetToS3({
    file: params.file,
    module: 'receiving',
    orderId: params.orderId,
    trackingCode,
  });

  const receivingVideo = await prisma.receivingVideo.create({
    data: {
      orderId: params.orderId,
      customerId: params.customerId,
      trackingCode,
      videoUrl: storedVideo.processedUrl,
      videoSize: BigInt(storedVideo.processedSize),
      duration: storedVideo.durationSec ?? null,
      packageVideoId: packageVideo?.id,
      comparisonNotes: storedVideo.processingError || null,
      comparisonStatus: 'pending',
      recordedAt: new Date(),
    },
  });

  await cleanupLocalFiles(storedVideo.localPaths);

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
