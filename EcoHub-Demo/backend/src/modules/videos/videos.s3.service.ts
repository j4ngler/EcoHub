import { RoleName, VideoModule, VideoUploadStatus } from '@prisma/client';
import prisma from '../../config/database';
import { badRequest, forbidden, notFound } from '../../middlewares/error.middleware';
import { getPagination, parseDateRange } from '../../utils/helpers';
import { getPresignedGetUrl, getPresignedPutUrl, headObject } from '../../services/s3.service';
import { getCaptureSettings } from '../settings/settings.service';

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

const sanitizeS3Segment = (value: string | null | undefined, fallback: string) => {
  const safe = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return safe || fallback;
};

const buildS3Key = (params: {
  shopId: string;
  module: VideoModule;
  orderId: string;
  trackingCode?: string | null;
  uploaderUserId: string;
  extension: string;
  employeeName?: string;
  workSessionLabel?: string;
}) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(36).slice(2, 8);

  const employeeFolder = sanitizeS3Segment(params.employeeName, 'unknown_employee');
  const sessionFolder = sanitizeS3Segment(params.workSessionLabel, 'ca');
  const safeOrderCode = sanitizeS3Segment(params.trackingCode || params.orderId, 'order');
  const safeExtension = sanitizeS3Segment(params.extension, 'mp4');

  return `videos/${employeeFolder}/${sessionFolder}/${params.module}/processed/${safeOrderCode}_${employeeFolder}_${timestamp}_${random}.${safeExtension}`;
};

const isGlobalVideoViewer = (roles: RoleName[]) =>
  roles.includes(RoleName.super_admin) ||
  roles.includes(RoleName.admin) ||
  roles.includes(RoleName.customer_service) ||
  // Shipper tra cứu video đóng gói của nhiều đơn/nhiều shop khác nhau đang giao.
  roles.includes(RoleName.shipper);

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const canAccessShop = async (currentUser: CurrentUser, shopId: string | null) => {
  if (!shopId || isGlobalVideoViewer(currentUser.roles || [])) return true;
  if (currentUser.shopId === shopId) return true;

  const role = await prisma.userRole.findFirst({
    where: {
      userId: currentUser.userId,
      shopId,
    },
    select: { id: true },
  });

  return Boolean(role);
};

const ensureCanAccessShop = async (currentUser: CurrentUser, shopId: string | null) => {
  if (!(await canAccessShop(currentUser, shopId))) {
    throw forbidden('Ban khong duoc phep thao tac voi video cua shop nay');
  }
};

const accessibleShopWhere = async (currentUser: CurrentUser) => {
  const roles = currentUser.roles || [];
  if (isGlobalVideoViewer(roles)) return {};

  const userRoles = await prisma.userRole.findMany({
    where: {
      userId: currentUser.userId,
      shopId: { not: null },
    },
    select: { shopId: true },
  });
  const shopIds = Array.from(
    new Set([
      ...(currentUser.shopId ? [currentUser.shopId] : []),
      ...userRoles.map((role) => role.shopId).filter(Boolean),
    ])
  ) as string[];

  return shopIds.length ? { shopId: { in: shopIds } } : { shopId: '__no_access__' };
};

export const assertCanViewVideoRecord = async (
  video: {
    shopId: string | null;
    uploaderUserId?: string | null;
    createdAt?: Date | null;
    order?: { customerId?: string | null } | null;
  },
  currentUser?: CurrentUser
) => {
  if (!currentUser) {
    throw forbidden('Vui long dang nhap de xem video');
  }

  const roles = currentUser.roles || [];
  const isCustomer = roles.includes(RoleName.customer);
  const isStaff = roles.includes(RoleName.staff);

  await ensureCanAccessShop(currentUser, video.shopId);

  if (isCustomer && video.order?.customerId && video.order.customerId !== currentUser.userId) {
    throw forbidden('Ban khong duoc phep xem video cua don hang nay');
  }

  if (!isGlobalVideoViewer(roles) && isStaff) {
    const isOwnVideo = video.uploaderUserId === currentUser.userId;
    const isTodayVideo = video.createdAt ? video.createdAt >= startOfToday() : false;
    if (!isOwnVideo && !isTodayVideo) {
      throw forbidden('Ban chi duoc xem video trong ngay hoac video do minh upload');
    }
  }
};

const ensureCanAccessOrder = async (orderId: string, currentUser?: CurrentUser) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      shopId: true,
      customerId: true,
      channelId: true,
      trackingCode: true,
    },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  if (!currentUser) {
    throw forbidden('Vui lòng đăng nhập để thực hiện thao tác này');
  }

  const roles = currentUser.roles || [];
  const isCustomer = roles.includes(RoleName.customer);
  const hasShopAccess = await canAccessShop(currentUser, order.shopId);

  if (!hasShopAccess) {
    throw forbidden('Bạn không được phép thao tác với đơn hàng của shop khác');
  }

  if (isCustomer && order.customerId && order.customerId !== currentUser.userId) {
    throw forbidden('Bạn chỉ được thao tác với đơn hàng của chính mình');
  }

  // Permission check for packaging staff
  if (roles.includes(RoleName.staff)) {
    if (order.shopId && order.channelId) {
      // Find the API connection for this order
      const connection = await prisma.shopChannelConnection.findFirst({
        where: {
          shopId: order.shopId,
          channelId: order.channelId,
          status: 'connected',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (connection) {
        // Check if the user is allocated to this connection
        const allocation = await prisma.userApiAllocation.findUnique({
          where: {
            userId_connectionId: {
              userId: currentUser.userId,
              connectionId: connection.id,
            }
          }
        });

        if (!allocation) {
          throw forbidden('Tài khoản của bạn chưa được phân bổ API này để thực hiện đóng gói.');
        }
      }
    }
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

  let employeeName = '';
  let workSessionLabel = '';

  try {
    const settings = await getCaptureSettings();
    if (settings?.employeeSession) {
      employeeName = settings.employeeSession.employeeName;
      workSessionLabel = settings.employeeSession.workSessionLabel;
    }
  } catch (err) {
    console.error('[S3 upload] Failed to load capture settings:', err);
  }

  const s3Key = buildS3Key({
    shopId: order.shopId,
    module: params.module,
    orderId: order.id,
    trackingCode: order.trackingCode,
    uploaderUserId: currentUser.userId,
    extension,
    employeeName,
    workSessionLabel,
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

  const hasShopAccess = await canAccessShop(currentUser, video.shopId);

  if (!hasShopAccess) {
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

  await assertCanViewVideoRecord(video, currentUser);

  const roles = currentUser.roles || [];
  const isSuperAdmin = roles.includes(RoleName.super_admin);
  const isAdmin = roles.includes(RoleName.admin);
  const isCustomerService = roles.includes(RoleName.customer_service);
  const isStaff = roles.includes(RoleName.staff);
  const isCustomer = roles.includes(RoleName.customer);

  if (false) {
    throw forbidden('Bạn không được phép xem video của shop khác');
  }

  if (isCustomer && video.order.customerId && video.order.customerId !== currentUser.userId) {
    throw forbidden('Bạn không được phép xem video của đơn hàng này');
  }

  const isAdminLike = isSuperAdmin || isAdmin || isCustomerService;
  if (false) {
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

  Object.assign(where, await accessibleShopWhere(currentUser));
  if (params.shopId) {
    if (!(await canAccessShop(currentUser, params.shopId))) {
      throw forbidden('Ban khong duoc phep xem video cua shop nay');
    }
    where.shopId = params.shopId;
  }

  if (params.uploaderUserId) {
    where.uploaderUserId = params.uploaderUserId;
  }

  if (params.orderId) {
    where.orderId = params.orderId;
  }

  if (params.module) {
    const moduleValue = String(params.module);
    if (Object.values(VideoModule).includes(moduleValue as VideoModule)) {
      where.module = moduleValue;
    }
  }

  if (params.status) {
    const statusValue = String(params.status).toUpperCase();
    if (Object.values(VideoUploadStatus).includes(statusValue as VideoUploadStatus)) {
      where.status = statusValue;
    }
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  const isStaff = roles.includes(RoleName.staff);

  if (!isGlobalVideoViewer(roles) && isStaff) {
    where.OR = [
      { uploaderUserId: currentUser.userId },
      { createdAt: { gte: startOfToday() } },
    ];
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

  for (const video of staleVideos) {
    const head = await headObject(video.s3Key);

    if (!head) {
      await prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoUploadStatus.FAILED,
          errorCode: 'TIMEOUT',
          errorMessage: 'Upload video quá thời gian cho phép mà không hoàn tất',
        },
      });

      await prisma.videoEvent.create({
        data: {
          videoId: video.id,
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
