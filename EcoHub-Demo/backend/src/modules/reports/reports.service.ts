import prisma from '../../config/database';
import { syncOrdersForConnection } from '../channels/tiktok-sync.service';
import { parseDateRange } from '../../utils/helpers';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { RoleName } from '@prisma/client';

interface ReportParams {
  shopId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
  staffId?: string;
  orderStatus?: string;
  packingStatus?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

const DEFAULT_TOTAL_STORAGE_GB = 100;
const TOTAL_STORAGE_GB = Number.parseFloat(process.env.VIDEO_STORAGE_LIMIT_GB || '') || DEFAULT_TOTAL_STORAGE_GB;
const TOTAL_STORAGE_BYTES = BigInt(Math.round(TOTAL_STORAGE_GB * 1024 * 1024 * 1024));

const getDirectorySizeBytes = async (dirPath: string): Promise<bigint> => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    let total = 0n;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await getDirectorySizeBytes(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        total += BigInt(stat.size);
      }
    }

    return total;
  } catch (err: any) {
    // Không có thư mục uploads (vd: môi trường mới) => coi như 0 bytes
    if (err?.code === 'ENOENT') return 0n;
    throw err;
  }
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const getDefaultOperationalRange = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const getRequestedRange = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return getDefaultOperationalRange();

  const start = startDate ? new Date(startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  const end = endDate ? new Date(endDate) : new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getDashboardDateFilter = (startDate?: string, endDate?: string) => {
  const explicit = parseDateRange(startDate, endDate);
  if (explicit) return explicit;
  const today = getTodayRange();
  return { gte: today.start, lte: today.end };
};

const resolveReportShopId = (params: ReportParams, currentUser?: CurrentUser) => {
  if (currentUser?.shopId) return currentUser.shopId;
  return params.shopId;
};

const isAdminLike = (roles?: RoleName[]) =>
  Boolean(
    roles?.includes(RoleName.super_admin) ||
      roles?.includes(RoleName.admin) ||
      roles?.includes(RoleName.customer_service)
  );

const buildDateSeries = (start: Date, end: Date) => {
  const dates: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  while (cur <= endDay) {
    dates.push(toISODate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
};

export const getDashboard = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const where: any = {};
  
  if (effectiveShopId) {
    where.shopId = effectiveShopId;
  }

  const dateFilter = getDashboardDateFilter(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }
  if (params.orderStatus) {
    where.status = params.orderStatus;
  }

  // Điều kiện riêng cho video (theo shop và khoảng thời gian)
  const videoWhere: any = {};
  if (effectiveShopId) {
    videoWhere.order = { shopId: effectiveShopId };
  }
  if (dateFilter) {
    videoWhere.createdAt = dateFilter;
  }
  if (params.staffId) {
    videoWhere.recordedBy = params.staffId;
  }
  if (!isAdminLike(currentUser?.roles) && currentUser?.roles.includes(RoleName.staff)) {
    videoWhere.recordedBy = currentUser.userId;
  }

  const allTimeVideoWhere: any = {};
  if (effectiveShopId) {
    allTimeVideoWhere.order = { shopId: effectiveShopId };
  }

  // Đơn "cần đóng gói quay video" = mọi đơn trong ngày trừ đơn đã hủy (đơn hủy không cần quay video).
  // Không ghi đè nếu người gọi đã tự lọc theo 1 status cụ thể (params.orderStatus).
  const packableWhere = params.orderStatus ? where : { ...where, status: { not: 'cancelled' } };

  // Get summary statistics
  const [
    totalOrders,
    pendingOrders,
    packingOrders,
    shippingOrders,
    completedOrders,
    cancelledOrders,
    totalVideos,
    processedVideos,
    totalProducts,
    lowStockProducts,
    revenueData,
    videoStorageAgg,
    receivingStorageAgg,
    largestVideos,
  ] = await Promise.all([
    prisma.order.count({ where: packableWhere }),
    prisma.order.count({ where: { ...where, status: 'pending' } }),
    prisma.order.count({ where: { ...where, status: { in: ['packing', 'packed'] } } }),
    prisma.order.count({ where: { ...where, status: 'shipping' } }),
    prisma.order.count({ where: { ...where, status: 'completed' } }),
    prisma.order.count({ where: { ...where, status: 'cancelled' } }),
    prisma.packageVideo.count({ where: allTimeVideoWhere }),
    prisma.packageVideo.count({ 
      where: { 
        processingStatus: 'completed',
        ...allTimeVideoWhere,
      } 
    }),
    prisma.product.count({ where: effectiveShopId ? { shopId: effectiveShopId } : {} }),
    prisma.product.count({ 
      where: { 
        ...(effectiveShopId ? { shopId: effectiveShopId } : {}),
        stockQuantity: { lte: prisma.product.fields.minStockLevel },
      } 
    }),
    prisma.order.aggregate({
      where: { ...where, status: 'completed' },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    }),
    prisma.packageVideo.aggregate({
      where: allTimeVideoWhere,
      _sum: {
        originalVideoSize: true,
        processedVideoSize: true,
      },
    }),
    prisma.receivingVideo.aggregate({
      where: effectiveShopId
        ? {
            order: { shopId: effectiveShopId },
          }
        : {},
      _sum: {
        videoSize: true,
      },
    }),
    prisma.packageVideo.findMany({
      where: allTimeVideoWhere,
      select: {
        id: true,
        trackingCode: true,
        createdAt: true,
        originalVideoSize: true,
        processedVideoSize: true,
        order: {
          select: {
            id: true,
            orderCode: true,
          },
        },
      },
      orderBy: {
        originalVideoSize: 'desc',
      },
      take: 5,
    }),
  ]);

  const originalBytes = BigInt(videoStorageAgg._sum.originalVideoSize || 0);
  const processedBytes = BigInt(videoStorageAgg._sum.processedVideoSize || 0);
  const receivingBytes = BigInt(receivingStorageAgg._sum.videoSize || 0);
  let usedBytesBigInt = originalBytes + processedBytes + receivingBytes;

  // Nếu không filter theo shop / thời gian => lấy dung lượng thật trên ổ đĩa (thư mục uploads)
  // DB có thể thiếu size với dữ liệu cũ, hoặc bị đếm trùng giữa file gốc và file đã xử lý.
  if (!effectiveShopId) {
    try {
      const uploadsDir = path.resolve(process.cwd(), 'uploads');
      usedBytesBigInt = await getDirectorySizeBytes(uploadsDir);
    } catch {
      // fallback dùng số liệu từ DB
    }
  }

  const totalStorageBytesNumber = Number(TOTAL_STORAGE_BYTES);
  const usedStorageBytesNumber = Number(usedBytesBigInt);
  const usedPercent =
    totalStorageBytesNumber > 0
      ? Number(((usedBytesBigInt * 100n) / TOTAL_STORAGE_BYTES).toString())
      : 0;

  let storageStatus: 'ok' | 'warning' | 'critical' = 'ok';
  if (usedPercent >= 90) {
    storageStatus = 'critical';
  } else if (usedPercent >= 80) {
    storageStatus = 'warning';
  }

  // Get recent orders
  const recentOrders = await prisma.order.findMany({
    where,
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orderCode: true,
      customerName: true,
      totalAmount: true,
      status: true,
      createdAt: true,
    },
  });

  // Get order status distribution
  const ordersByStatus = await prisma.order.groupBy({
    by: ['status'],
    where,
    _count: true,
  });

  const packedOrders = await prisma.order.count({
    where: { ...packableWhere, packageVideos: { some: {} } },
  });
  const unpackedOrders = Math.max(0, totalOrders - packedOrders);

  const packingByStaff = await prisma.packageVideo.groupBy({
    by: ['recordedBy'],
    where: videoWhere,
    _count: true,
  });

  const staffIds = packingByStaff.map((item) => item.recordedBy);
  const staffMembers = staffIds.length
    ? await prisma.user.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, fullName: true, email: true },
      })
    : [];

  const shippingReturnSummary = await prisma.order.groupBy({
    by: ['status'],
    where: {
      ...(effectiveShopId ? { shopId: effectiveShopId } : {}),
      createdAt: dateFilter,
      status: { in: ['shipping', 'delivered', 'returned'] },
    },
    _count: true,
  });

  return {
    summary: {
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        packing: packingOrders,
        shipping: shippingOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
      },
      videos: {
        total: totalVideos,
        processed: processedVideos,
        pending: totalVideos - processedVideos,
        packed: packedOrders,
        unpacked: unpackedOrders,
      },
      products: {
        total: totalProducts,
        lowStock: lowStockProducts,
      },
      revenue: {
        total: revenueData._sum.totalAmount || 0,
        average: revenueData._avg.totalAmount || 0,
      },
      storage: {
        totalBytes: totalStorageBytesNumber,
        usedBytes: usedStorageBytesNumber,
        usedPercent,
        status: storageStatus,
      },
    },
    recentOrders,
    ordersByStatus: ordersByStatus.map(item => ({
      status: item.status,
      count: item._count,
    })),
    shippingReturnSummary: shippingReturnSummary.map(item => ({
      status: item.status,
      count: item._count,
    })),
    packingByStaff: packingByStaff
      .map((item) => {
        const staff = staffMembers.find((member) => member.id === item.recordedBy);
        return {
          staffId: item.recordedBy,
          staffName: staff?.fullName || 'Không xác định',
          email: staff?.email || null,
          count: item._count,
        };
      })
      .sort((a, b) => b.count - a.count),
    storage: {
      largestVideos: largestVideos.map(v => ({
        id: v.id,
        trackingCode: v.trackingCode,
        createdAt: v.createdAt,
        orderId: v.order.id,
        orderCode: v.order.orderCode,
        totalSizeBytes:
          Number(v.originalVideoSize || 0n) + Number(v.processedVideoSize || 0n),
      })),
    },
  };
};

export const getOperationalReport = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const { start, end } = getRequestedRange(params.startDate, params.endDate);
  const dateSeries = buildDateSeries(start, end);

  // Orders: group theo ngày
  const ordersRows = await prisma.$queryRaw<
    Array<{
      day: Date;
      total: number;
      pending: number;
      packing: number;
      packed: number;
      unpacked: number;
      shipping: number;
      delivered: number;
      returned: number;
      completed: number;
      cancelled: number;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('day', o.created_at) AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE o.status = 'packing')::int AS packing,
      COUNT(*) FILTER (WHERE o.status = 'packed')::int AS packed,
      COUNT(*) FILTER (WHERE o.status NOT IN ('packed','shipping','delivered','completed','returned','cancelled'))::int AS unpacked,
      COUNT(*) FILTER (WHERE o.status = 'shipping')::int AS shipping,
      COUNT(*) FILTER (WHERE o.status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE o.status = 'returned')::int AS returned,
      COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled
    FROM orders o
    WHERE o.created_at >= ${start} AND o.created_at <= ${end}
    ${effectiveShopId ? Prisma.sql`AND o.shop_id = ${effectiveShopId}` : Prisma.empty}
    ${params.orderStatus ? Prisma.sql`AND o.status = ${params.orderStatus}` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  // Package videos: group theo ngày (join orders để lọc shopId nếu cần)
  const videosRows = await prisma.$queryRaw<
    Array<{
      day: Date;
      total: number;
      processed: number;
      failed: number;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('day', pv.created_at) AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE pv.processing_status = 'completed')::int AS processed,
      COUNT(*) FILTER (WHERE pv.processing_status = 'failed')::int AS failed
    FROM package_videos pv
    LEFT JOIN orders o ON o.id = pv.order_id
    WHERE pv.created_at >= ${start} AND pv.created_at <= ${end}
    ${effectiveShopId ? Prisma.sql`AND o.shop_id = ${effectiveShopId}` : Prisma.empty}
    ${params.staffId ? Prisma.sql`AND pv.recorded_by = ${params.staffId}` : Prisma.empty}
    ${
      !isAdminLike(currentUser?.roles) && currentUser?.roles.includes(RoleName.staff)
        ? Prisma.sql`AND pv.recorded_by = ${currentUser.userId}`
        : Prisma.empty
    }
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  // Receiving videos: group theo ngày
  const receivingRows = await prisma.$queryRaw<
    Array<{
      day: Date;
      total: number;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('day', rv.created_at) AS day,
      COUNT(*)::int AS total
    FROM receiving_videos rv
    LEFT JOIN orders o ON o.id = rv.order_id
    WHERE rv.created_at >= ${start} AND rv.created_at <= ${end}
    ${effectiveShopId ? Prisma.sql`AND o.shop_id = ${effectiveShopId}` : Prisma.empty}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  const ordersByDay = new Map<string, (typeof ordersRows)[number]>();
  ordersRows.forEach(r => ordersByDay.set(toISODate(new Date(r.day)), r));

  const videosByDay = new Map<string, (typeof videosRows)[number]>();
  videosRows.forEach(r => videosByDay.set(toISODate(new Date(r.day)), r));

  const receivingByDay = new Map<string, (typeof receivingRows)[number]>();
  receivingRows.forEach(r => receivingByDay.set(toISODate(new Date(r.day)), r));

  const daily = dateSeries.map(date => {
    const o = ordersByDay.get(date);
    const v = videosByDay.get(date);
    const rv = receivingByDay.get(date);
    return {
      date,
      orders: {
        total: o?.total ?? 0,
        pending: o?.pending ?? 0,
        packing: o?.packing ?? 0,
        packed: o?.packed ?? 0,
        unpacked: o?.unpacked ?? 0,
        shipping: o?.shipping ?? 0,
        delivered: o?.delivered ?? 0,
        returned: o?.returned ?? 0,
        completed: o?.completed ?? 0,
        cancelled: o?.cancelled ?? 0,
      },
      videos: {
        total: v?.total ?? 0,
        processed: v?.processed ?? 0,
        failed: v?.failed ?? 0,
      },
      receivingVideos: {
        total: rv?.total ?? 0,
      },
    };
  });

  return {
    range: { startDate: toISODate(start), endDate: toISODate(end) },
    daily,
  };
};

export const syncNow = async (userId: string, channels?: Array<'shopee' | 'tiktok'>, shopId?: string | null) => {
  const channelCodes = channels && channels.length > 0 ? channels : (['shopee', 'tiktok'] as const);
  const startedAt = new Date();

  let connections = await prisma.shopChannelConnection.findMany({
    where: {
      status: 'connected',
      ...(shopId ? { shopId } : {}),
      channel: { code: { in: [...channelCodes] } },
    },
    include: {
      channel: true,
      shop: true,
    },
  });

  const results: Array<{
    shopId: string;
    shopName: string;
    channelCode: string;
    channelName: string;
    synced: number;
    created: number;
    updated: number;
    failed: number;
    lastSyncAt: Date;
    error?: string;
  }> = [];

  for (const c of connections) {
    try {
      if (c.channel.code !== 'tiktok') {
        throw new Error(`Chua ho tro dong bo tu dong cho kenh ${c.channel.name}`);
      }
      const result = await syncOrdersForConnection(c, userId);
      results.push({
        shopId: c.shopId,
        shopName: c.shop.name,
        channelCode: c.channel.code,
        channelName: c.channel.name,
        synced: result.synced,
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        lastSyncAt: result.lastSyncAt,
      });
    } catch (e: any) {
      results.push({
        shopId: c.shopId,
        shopName: c.shop.name,
        channelCode: c.channel.code,
        channelName: c.channel.name,
        synced: 0,
        created: 0,
        updated: 0,
        failed: 1,
        lastSyncAt: new Date(),
        error: e?.message || String(e),
      });
    }
  }

  const finishedAt = new Date();
  const total = results.reduce(
    (acc, r) => ({
      synced: acc.synced + r.synced,
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      failed: acc.failed + r.failed,
    }),
    { synced: 0, created: 0, updated: 0, failed: 0 }
  );

  return {
    startedAt,
    finishedAt,
    connections: results.length,
    total,
    results,
  };
};

export const getOrderReport = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const where: any = {};
  
  if (effectiveShopId) {
    where.shopId = effectiveShopId;
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // Get orders grouped by status
  const ordersByStatus = await prisma.order.groupBy({
    by: ['status'],
    where,
    _count: true,
    _sum: { totalAmount: true },
  });

  // Get orders by channel
  const ordersByChannel = await prisma.order.groupBy({
    by: ['channelId'],
    where,
    _count: true,
    _sum: { totalAmount: true },
  });

  // Get orders by carrier
  const ordersByCarrier = await prisma.order.groupBy({
    by: ['carrierId'],
    where,
    _count: true,
  });

  // Get channel and carrier details
  const channels = await prisma.salesChannel.findMany();
  const carriers = await prisma.shippingCarrier.findMany();

  return {
    byStatus: ordersByStatus.map(item => ({
      status: item.status,
      count: item._count,
      revenue: item._sum.totalAmount || 0,
    })),
    byChannel: ordersByChannel.map(item => ({
      channelId: item.channelId,
      channelName: channels.find(c => c.id === item.channelId)?.name || 'Không xác định',
      count: item._count,
      revenue: item._sum.totalAmount || 0,
    })),
    byCarrier: ordersByCarrier.map(item => ({
      carrierId: item.carrierId,
      carrierName: carriers.find(c => c.id === item.carrierId)?.name || 'Không xác định',
      count: item._count,
    })),
  };
};

export const getVideoReport = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const where: any = {};
  
  if (effectiveShopId) {
    where.order = { shopId: effectiveShopId };
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }
  if (params.staffId) {
    where.recordedBy = params.staffId;
  }
  if (!isAdminLike(currentUser?.roles) && currentUser?.roles.includes(RoleName.staff)) {
    where.recordedBy = currentUser.userId;
  }

  // Get videos by processing status
  const videosByStatus = await prisma.packageVideo.groupBy({
    by: ['processingStatus'],
    where,
    _count: true,
  });

  // Get videos by recorder
  const videosByRecorder = await prisma.packageVideo.groupBy({
    by: ['recordedBy'],
    where,
    _count: true,
  });

  // Get recorder details
  const recorderIds = videosByRecorder.map(v => v.recordedBy);
  const recorders = await prisma.user.findMany({
    where: { id: { in: recorderIds } },
    select: { id: true, fullName: true },
  });

  // Get total video stats
  const totalVideos = await prisma.packageVideo.count({ where });
  const approvedVideos = await prisma.packageVideo.count({
    where: { ...where, approvedAt: { not: null } },
  });

  return {
    summary: {
      total: totalVideos,
      approved: approvedVideos,
      pendingApproval: totalVideos - approvedVideos,
    },
    byStatus: videosByStatus.map(item => ({
      status: item.processingStatus,
      count: item._count,
    })),
    byRecorder: videosByRecorder.map(item => ({
      recorderId: item.recordedBy,
      recorderName: recorders.find(r => r.id === item.recordedBy)?.fullName || 'Không xác định',
      count: item._count,
    })),
  };
};

export const getRevenueReport = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const where: any = { status: 'completed' };
  
  if (effectiveShopId) {
    where.shopId = effectiveShopId;
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.completedAt = dateFilter;
  }

  // Get total revenue
  const totalRevenue = await prisma.order.aggregate({
    where,
    _sum: { 
      totalAmount: true,
      shippingFee: true,
      discountAmount: true,
    },
    _count: true,
    _avg: { totalAmount: true },
  });

  // Get revenue by channel
  const revenueByChannel = await prisma.order.groupBy({
    by: ['channelId'],
    where,
    _sum: { totalAmount: true },
    _count: true,
  });

  const channels = await prisma.salesChannel.findMany();

  return {
    summary: {
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      totalShippingFee: totalRevenue._sum.shippingFee || 0,
      totalDiscount: totalRevenue._sum.discountAmount || 0,
      orderCount: totalRevenue._count,
      averageOrderValue: totalRevenue._avg.totalAmount || 0,
    },
    byChannel: revenueByChannel.map(item => ({
      channelId: item.channelId,
      channelName: channels.find(c => c.id === item.channelId)?.name || 'Trực tiếp',
      revenue: item._sum.totalAmount || 0,
      orderCount: item._count,
    })),
  };
};

export const getStaffPerformance = async (params: ReportParams, currentUser?: CurrentUser) => {
  const effectiveShopId = resolveReportShopId(params, currentUser);
  const where: any = {};
  
  if (effectiveShopId) {
    where.order = { shopId: effectiveShopId };
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }
  if (params.staffId) {
    where.recordedBy = params.staffId;
  }
  if (!isAdminLike(currentUser?.roles) && currentUser?.roles.includes(RoleName.staff)) {
    where.recordedBy = currentUser.userId;
  }

  // Get video counts by staff
  const videosByStaff = await prisma.packageVideo.groupBy({
    by: ['recordedBy'],
    where,
    _count: true,
  });

  // Get staff details
  const staffIds = videosByStaff.map(v => v.recordedBy);
  const staffMembers = await prisma.user.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, fullName: true, email: true },
  });

  // Get approved video counts
  const approvedByStaff = await prisma.packageVideo.groupBy({
    by: ['recordedBy'],
    where: { ...where, approvedAt: { not: null } },
    _count: true,
  });

  return {
    staff: staffMembers.map(staff => {
      const totalVideos = videosByStaff.find(v => v.recordedBy === staff.id)?._count || 0;
      const approvedVideos = approvedByStaff.find(v => v.recordedBy === staff.id)?._count || 0;
      
      return {
        id: staff.id,
        name: staff.fullName,
        email: staff.email,
        totalVideos,
        approvedVideos,
        approvalRate: totalVideos > 0 ? ((approvedVideos / totalVideos) * 100).toFixed(1) : 0,
      };
    }).sort((a, b) => b.totalVideos - a.totalVideos),
  };
};
