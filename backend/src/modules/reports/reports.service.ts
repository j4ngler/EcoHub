import prisma from '../../config/database';
import { parseDateRange } from '../../utils/helpers';

interface ReportParams {
  shopId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}

export const getDashboard = async (params: ReportParams) => {
  const where: any = {};
  
  if (params.shopId) {
    where.shopId = params.shopId;
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
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
  ]);

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
    },
    recentOrders,
    ordersByStatus: ordersByStatus.map(item => ({
      status: item.status,
      count: item._count,
    })),
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
