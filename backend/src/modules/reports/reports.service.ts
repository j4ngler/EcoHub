import prisma from '../../config/database';
import { parseDateRange } from '../../utils/helpers';
import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';

interface ReportParams {
  shopId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}

const DEFAULT_TOTAL_STORAGE_GB = 50;
const TOTAL_STORAGE_GB = Number.parseInt(process.env.VIDEO_STORAGE_LIMIT_GB || '', 10) || DEFAULT_TOTAL_STORAGE_GB;
const TOTAL_STORAGE_BYTES = BigInt(TOTAL_STORAGE_GB) * 1024n * 1024n * 1024n;

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

export const getDashboard = async (params: ReportParams) => {
  const where: any = {};
  
  if (params.shopId) {
    where.shopId = params.shopId;
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // Điều kiện riêng cho video (theo shop và khoảng thời gian)
  const videoWhere: any = {};
  if (params.shopId) {
    videoWhere.order = { shopId: params.shopId };
  }
  if (dateFilter) {
    videoWhere.createdAt = dateFilter;
  }

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
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, status: 'pending' } }),
    prisma.order.count({ where: { ...where, status: { in: ['packing', 'packed'] } } }),
    prisma.order.count({ where: { ...where, status: 'shipping' } }),
    prisma.order.count({ where: { ...where, status: 'completed' } }),
    prisma.order.count({ where: { ...where, status: 'cancelled' } }),
    prisma.packageVideo.count({ where: params.shopId ? { order: { shopId: params.shopId } } : {} }),
    prisma.packageVideo.count({ 
      where: { 
        processingStatus: 'completed',
        ...(params.shopId ? { order: { shopId: params.shopId } } : {}),
      } 
    }),
    prisma.product.count({ where: params.shopId ? { shopId: params.shopId } : {} }),
    prisma.product.count({ 
      where: { 
        ...(params.shopId ? { shopId: params.shopId } : {}),
        stockQuantity: { lte: prisma.product.fields.minStockLevel },
      } 
    }),
    prisma.order.aggregate({
      where: { ...where, status: 'completed' },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    }),
    prisma.packageVideo.aggregate({
      where: videoWhere,
      _sum: {
        originalVideoSize: true,
        processedVideoSize: true,
      },
    }),
    prisma.receivingVideo.aggregate({
      where: params.shopId
        ? {
            order: { shopId: params.shopId },
            ...(dateFilter ? { createdAt: dateFilter } : {}),
          }
        : dateFilter
        ? { createdAt: dateFilter }
        : {},
      _sum: {
        videoSize: true,
      },
    }),
    prisma.packageVideo.findMany({
      where: videoWhere,
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
  // (DB có thể thiếu size với dữ liệu cũ, hoặc bị "double count" do demo dùng chung 1 file cho original+processed)
  if (!params.shopId && !dateFilter) {
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

export const getOperationalReport = async (params: ReportParams) => {
  const { start, end } = getRequestedRange(params.startDate, params.endDate);
  const dateSeries = buildDateSeries(start, end);

  // Orders: group theo ngày
  const ordersRows = await prisma.$queryRaw<
    Array<{
      day: Date;
      total: number;
      pending: number;
      packing: number;
      shipping: number;
      completed: number;
      cancelled: number;
    }>
  >(Prisma.sql`
    SELECT
      date_trunc('day', o.created_at) AS day,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE o.status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE o.status IN ('packing','packed'))::int AS packing,
      COUNT(*) FILTER (WHERE o.status = 'shipping')::int AS shipping,
      COUNT(*) FILTER (WHERE o.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE o.status = 'cancelled')::int AS cancelled
    FROM orders o
    WHERE o.created_at >= ${start} AND o.created_at <= ${end}
    ${params.shopId ? Prisma.sql`AND o.shop_id = ${params.shopId}` : Prisma.empty}
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
    ${params.shopId ? Prisma.sql`AND o.shop_id = ${params.shopId}` : Prisma.empty}
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
    ${params.shopId ? Prisma.sql`AND o.shop_id = ${params.shopId}` : Prisma.empty}
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
        shipping: o?.shipping ?? 0,
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

  // Nếu chưa có kết nối nào (môi trường demo mới), tự tạo kết nối demo để nút "Cập nhật dữ liệu" hoạt động ngay
  if (connections.length === 0) {
    const effectiveShopId =
      shopId ||
      (await prisma.shop.findFirst({ where: { code: 'ECOHUB_DEMO' }, select: { id: true } }))?.id;

    if (effectiveShopId) {
      const demoChannels = await prisma.salesChannel.findMany({
        where: { code: { in: [...channelCodes] } },
        select: { id: true, code: true },
      });

      for (const ch of demoChannels) {
        await prisma.shopChannelConnection.upsert({
          where: { shopId_channelId: { shopId: effectiveShopId, channelId: ch.id } },
          update: { status: 'connected' },
          create: { shopId: effectiveShopId, channelId: ch.id, status: 'connected' },
        });
      }

      connections = await prisma.shopChannelConnection.findMany({
        where: {
          status: 'connected',
          shopId: effectiveShopId,
          channel: { code: { in: [...channelCodes] } },
        },
        include: { channel: true, shop: true },
      });
    }
  }

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
      if (c.channel.code === 'shopee') {
        const { syncDemoShopeeOrders } = await import('../../services/demo-channel-sync.service');
        const r = await syncDemoShopeeOrders(c.shopId, c.channelId, userId);
        results.push({
          shopId: c.shopId,
          shopName: c.shop.name,
          channelCode: c.channel.code,
          channelName: c.channel.name,
          synced: r.synced,
          created: r.created,
          updated: r.updated,
          failed: r.failed,
          lastSyncAt: r.lastSyncAt,
        });
      } else if (c.channel.code === 'tiktok') {
        const { syncDemoTikTokOrders } = await import('../../services/demo-channel-sync.service');
        const r = await syncDemoTikTokOrders(c.shopId, c.channelId, userId);
        results.push({
          shopId: c.shopId,
          shopName: c.shop.name,
          channelCode: c.channel.code,
          channelName: c.channel.name,
          synced: r.synced,
          created: r.created,
          updated: r.updated,
          failed: r.failed,
          lastSyncAt: r.lastSyncAt,
        });
      }
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

export const getOrderReport = async (params: ReportParams) => {
  const where: any = {};
  
  if (params.shopId) {
    where.shopId = params.shopId;
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

export const getVideoReport = async (params: ReportParams) => {
  const where: any = {};
  
  if (params.shopId) {
    where.order = { shopId: params.shopId };
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
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

export const getRevenueReport = async (params: ReportParams) => {
  const where: any = { status: 'completed' };
  
  if (params.shopId) {
    where.shopId = params.shopId;
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

export const getStaffPerformance = async (params: ReportParams) => {
  const where: any = {};
  
  if (params.shopId) {
    where.order = { shopId: params.shopId };
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
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
