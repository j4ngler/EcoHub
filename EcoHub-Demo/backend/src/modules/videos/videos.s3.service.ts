import { VideoModule, VideoUploadStatus, RoleName } from '@prisma/client';
import prisma from '../../config/database';
import { badRequest, forbidden, notFound } from '../../middlewares/error.middleware';
import { getPagination, parseDateRange } from '../../utils/helpers';
import { getPresignedPutUrl, getPresignedGetUrl, headObject } from '../../services/s3.service';

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

export interface InitUploadParams {
  orderId: string;
  module: VideoModule;
  contentType?: string;
  fileName?: string;
  sizeBytes?: number;
}

export interface CompleteUploadParams {
  videoId: string;
  sizeBytes?: number;
  durationSec?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface ListVideosParams {
  page: number;
  limit: number;
  shopId?: string;
  uploaderUserId?: string;
  module?: VideoModule | string;
  orderId?: string;
  status?: VideoUploadStatus | string;
  startDate?: string;
  endDate?: string;
}

const inferExtension = (contentType?: string, fileName?: string) => {
  if (fileName && fileName.includes('.')) {
    return fileName.split('.').pop()!;
  }

  if (!contentType) return 'mp4';

  if (contentType === 'video/mp4') return 'mp4';
  if (contentType === 'video/quicktime') return 'mov';
  if (contentType === 'video/x-matroska') return 'mkv';

  return 'mp4';
};

const buildS3Key = (params: {
  shopId: string;
  module: VideoModule;
  orderId: string;
  uploaderUserId: string;
  extension: string;
}) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(36).slice(2, 8);

  return `videos/${params.shopId}/${params.module}/${params.orderId}/${params.uploaderUserId}/${timestamp}_${random}.${params.extension}`;
};

const ensureCanAccessOrder = async (orderId: string, currentUser?: CurrentUser) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shopId: true,
      customerId: true,
    },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để thực hiện thao tác này');
  }

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const isCustomer = roles.includes(RoleName.customer);

  // Nếu đang ở ngữ cảnh shop thì chỉ thao tác với đơn thuộc shop đó (trừ Super Admin)
  if (currentUser.shopId && order.shopId !== currentUser.shopId && !isSuperAdmin) {
    throw forbidden('Bạn không được phép thao tác với đơn hàng của shop khác');
  }

  // Nếu là khách hàng: chỉ được thao tác với đơn của chính mình
  if (isCustomer && order.customerId && order.customerId !== currentUser.userId) {
    throw forbidden('Bạn chỉ được thao tác với đơn hàng của chính mình');
  }

  return order;
};

export const initUpload = async (params: InitUploadParams, currentUser?: CurrentUser) => {
  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để upload video');
  }

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const isAdmin = roles.includes(RoleName.admin);
  const isStaff = roles.includes(RoleName.staff);
  const isCustomerService = roles.includes(RoleName.customer_service);
  const isCustomer = roles.includes(RoleName.customer);

  if (isCustomer && params.module !== VideoModule.receiving) {
    throw forbidden('Khách hàng chỉ được upload video nhận hàng');
  }

  if (!isCustomer && !(isSuperAdmin || isAdmin || isStaff || isCustomerService)) {
    throw forbidden('Bạn không có quyền upload video');
  }

  const order = await ensureCanAccessOrder(params.orderId, currentUser);

  const contentType = params.contentType || 'video/mp4';
  const extension = inferExtension(contentType, params.fileName);

  const s3Key = buildS3Key({
    shopId: order.shopId,
    module: params.module,
    orderId: order.id,
    uploaderUserId: currentUser.userId,
    extension,
  });

  const presigned = await getPresignedPutUrl({
    key: s3Key,
    contentType,
  });

  const video = await prisma.video.create({
    data: {
      shopId: order.shopId,
      orderId: order.id,
      uploaderUserId: currentUser.userId,
      module: params.module,
      s3Bucket: presigned.bucket,
      s3Key,
      contentType,
      sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : null,
      status: VideoUploadStatus.UPLOADING,
    },
  });

  await prisma.videoEvent.create({
    data: {
      videoId: video.id,
      type: 'INIT_UPLOAD',
      payload: {
        module: params.module,
        contentType,
        sizeBytes: params.sizeBytes ?? null,
        orderId: order.id,
        shopId: order.shopId,
        uploaderUserId: currentUser.userId,
      },
    },
  });

  return {
    videoId: video.id,
    uploadUrl: presigned.url,
    uploadHeaders: {
      'Content-Type': contentType,
    },
    s3Key,
    bucket: presigned.bucket,
  };
};

export const completeUpload = async (params: CompleteUploadParams, currentUser?: CurrentUser) => {
  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để xác nhận upload video');
  }

  const video = await prisma.video.findUnique({
    where: { id: params.videoId },
    include: {
      order: {
        select: {
          id: true,
          shopId: true,
          customerId: true,
        },
      },
    },
  });

  if (!video) {
    throw notFound('Không tìm thấy video');
  }

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);

  if (currentUser.shopId && video.shopId !== currentUser.shopId && !isSuperAdmin) {
    throw forbidden('Bạn không được phép chỉnh sửa video của shop khác');
  }

  if (video.status === VideoUploadStatus.DELETED) {
    throw badRequest('Video đã bị xóa');
  }

  const isFailure = params.success === false || !!params.errorCode || !!params.errorMessage;

  if (isFailure) {
    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoUploadStatus.FAILED,
        errorCode: params.errorCode || 'CLIENT_ERROR',
        errorMessage: params.errorMessage || 'Upload video thất bại từ phía client',
        sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : video.sizeBytes,
        durationSec: params.durationSec ?? video.durationSec,
      },
    });

    await prisma.videoEvent.create({
      data: {
        videoId: video.id,
        type: 'UPLOAD_FAILED',
        payload: {
          sizeBytes: params.sizeBytes ?? null,
          durationSec: params.durationSec ?? null,
          errorCode: updated.errorCode,
          errorMessage: updated.errorMessage,
          byUserId: currentUser.userId,
        },
      },
    });

    return updated;
  }

  // Kiểm tra object trong S3 có tồn tại không
  const head = await headObject(video.s3Key);
  if (!head) {
    const updated = await prisma.video.update({
      where: { id: video.id },
      data: {
        status: VideoUploadStatus.FAILED,
        errorCode: 'OBJECT_NOT_FOUND',
        errorMessage: 'Không tìm thấy file video trên S3 sau khi upload',
        sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : video.sizeBytes,
        durationSec: params.durationSec ?? video.durationSec,
      },
    });

    await prisma.videoEvent.create({
      data: {
        videoId: video.id,
        type: 'UPLOAD_FAILED',
        payload: {
          reason: 'OBJECT_NOT_FOUND',
          headResult: null,
          byUserId: currentUser.userId,
        },
      },
    });

    return updated;
  }

  const sizeFromHead =
    typeof head.ContentLength === 'number' ? BigInt(head.ContentLength) : video.sizeBytes;

  const updated = await prisma.video.update({
    where: { id: video.id },
    data: {
      status: VideoUploadStatus.READY,
      uploadedAt: new Date(),
      sizeBytes: params.sizeBytes ? BigInt(params.sizeBytes) : sizeFromHead,
      durationSec: params.durationSec ?? video.durationSec,
      errorCode: null,
      errorMessage: null,
    },
  });

  await prisma.videoEvent.create({
    data: {
      videoId: video.id,
      type: 'UPLOAD_COMPLETED',
      payload: {
        sizeBytes: updated.sizeBytes?.toString() ?? null,
        durationSec: updated.durationSec ?? null,
        byUserId: currentUser.userId,
      },
    },
  });

  return updated;
};

export const getVideoViewUrl = async (videoId: string, currentUser?: CurrentUser) => {
  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để xem video');
  }

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: {
      order: {
        select: {
          id: true,
          shopId: true,
          customerId: true,
          orderCode: true,
          trackingCode: true,
        },
      },
      uploader: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  if (!video) {
    throw notFound('Không tìm thấy video');
  }

  if (video.status !== VideoUploadStatus.READY) {
    throw badRequest('Video chưa sẵn sàng để xem (đang upload hoặc đã lỗi)');
  }

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const isAdmin = roles.includes(RoleName.admin);
  const isCustomerService = roles.includes(RoleName.customer_service);
  const isStaff = roles.includes(RoleName.staff);
  const isCustomer = roles.includes(RoleName.customer);

  // Giới hạn theo shop
  if (currentUser.shopId && video.shopId !== currentUser.shopId && !isSuperAdmin) {
    throw forbidden('Bạn không được phép xem video của shop khác');
  }

  // Khách hàng chỉ xem video của đơn hàng của chính mình
  if (isCustomer && video.order.customerId && video.order.customerId !== currentUser.userId) {
    throw forbidden('Bạn không được phép xem video của đơn hàng này');
  }

  // Nhân viên đóng gói chỉ xem video do mình upload, trừ khi là Admin / CSKH / Super Admin
  const isAdminLike = isSuperAdmin || isAdmin || isCustomerService;
  if (!isAdminLike && isStaff && video.uploaderUserId !== currentUser.userId) {
    throw forbidden('Bạn chỉ được phép xem video do mình upload');
  }

  const presigned = await getPresignedGetUrl({
    key: video.s3Key,
  });

  await prisma.videoEvent.create({
    data: {
      videoId: video.id,
      type: 'VIEW_URL_REQUESTED',
      payload: {
        byUserId: currentUser.userId,
      },
    },
  });

  return {
    url: presigned.url,
    expiresInSeconds: 3600,
    video: {
      id: video.id,
      module: video.module,
      status: video.status,
      sizeBytes: video.sizeBytes,
      durationSec: video.durationSec,
      order: video.order,
      uploader: video.uploader,
    },
  };
};

export const listVideos = async (params: ListVideosParams, currentUser?: CurrentUser) => {
  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để xem danh sách video');
  }

  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);

  // Giới hạn theo shop
  if (currentUser.shopId && !isSuperAdmin) {
    where.shopId = currentUser.shopId;
  } else if (params.shopId) {
    where.shopId = params.shopId;
  }

  if (params.uploaderUserId) {
    where.uploaderUserId = params.uploaderUserId;
  }

  if (params.orderId) {
    where.orderId = params.orderId;
  }

  if (params.module) {
    const moduleValue = typeof params.module === 'string' ? params.module : params.module.toString();
    if (Object.values(VideoModule).includes(moduleValue as VideoModule)) {
      where.module = moduleValue;
    }
  }

  if (params.status) {
    const statusValue =
      typeof params.status === 'string' ? params.status.toUpperCase() : params.status.toString();
    if (Object.values(VideoUploadStatus).includes(statusValue as VideoUploadStatus)) {
      where.status = statusValue;
    }
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // Nhân viên đóng gói chỉ xem video do mình upload (trong shop), Admin / CSKH / Super Admin xem tất cả
  const isAdmin = roles.includes(RoleName.admin);
  const isCustomerService = roles.includes(RoleName.customer_service);
  const isStaff = roles.includes(RoleName.staff);

  const isAdminLike = isSuperAdmin || isAdmin || isCustomerService;

  if (!isAdminLike && isStaff) {
    where.uploaderUserId = currentUser.userId;
  }

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            trackingCode: true,
            status: true,
            customerName: true,
          },
        },
        uploader: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    }),
    prisma.video.count({ where }),
  ]);

  return {
    videos,
    total,
    page,
    limit,
  };
};

export const cleanupStaleUploads = async (maxMinutesUploading = 30) => {
  const cutoff = new Date(Date.now() - maxMinutesUploading * 60 * 1000);

  const staleVideos = await prisma.video.findMany({
    where: {
      status: VideoUploadStatus.UPLOADING,
      createdAt: {
        lt: cutoff,
      },
    },
    select: {
      id: true,
      s3Key: true,
    },
  });

  let failedCount = 0;

  for (const v of staleVideos) {
    const head = await headObject(v.s3Key);

    if (!head) {
      await prisma.video.update({
        where: { id: v.id },
        data: {
          status: VideoUploadStatus.FAILED,
          errorCode: 'TIMEOUT',
          errorMessage: 'Upload video quá thời gian cho phép mà không hoàn tất',
        },
      });

      await prisma.videoEvent.create({
        data: {
          videoId: v.id,
          type: 'UPLOAD_TIMEOUT',
          payload: {
            reason: 'NO_OBJECT',
            checkedAt: new Date().toISOString(),
          },
        },
      });

      failedCount += 1;
    }
  }

  return {
    checked: staleVideos.length,
    markedFailed: failedCount,
  };
};

