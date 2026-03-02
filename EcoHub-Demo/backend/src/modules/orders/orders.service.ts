import prisma from '../../config/database';
import { notFound, badRequest, forbidden } from '../../middlewares/error.middleware';
import { getPagination, generateOrderCode, generateTrackingCode, parseDateRange } from '../../utils/helpers';
import { CreateOrderDto, UpdateOrderDto } from './orders.dto';
import { OrderStatus, RoleName } from '@prisma/client';

interface GetOrdersParams {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  shopId?: string;
  channelId?: string;
  carrierId?: string;
  startDate?: string;
  endDate?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

export const getOrders = async (params: GetOrdersParams, currentUser?: CurrentUser) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};

  if (params.search) {
    where.OR = [
      { orderCode: { contains: params.search, mode: 'insensitive' } },
      { trackingCode: { contains: params.search, mode: 'insensitive' } },
      { customerName: { contains: params.search, mode: 'insensitive' } },
      { customerPhone: { contains: params.search } },
    ];
  }

  if (params.status) {
    where.status = params.status;
  }

  // Scope theo shop
  // Nếu user đang quản lý 1 shop (impersonate) => luôn lọc theo shop đó
  // Nếu không, cho phép filter theo shopId query (super admin xem nhiều shop)
  if (currentUser?.shopId) {
    where.shopId = currentUser.shopId;
  } else if (params.shopId) {
    where.shopId = params.shopId;
  }

  if (params.channelId) {
    where.channelId = params.channelId;
  }

  if (params.carrierId) {
    where.carrierId = params.carrierId;
  }

  const dateFilter = parseDateRange(params.startDate, params.endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  // Nếu là customer, chỉ cho xem các đơn hàng của chính họ
  if (currentUser?.roles.includes(RoleName.customer)) {
    where.customerId = currentUser.userId;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { id: true, name: true, code: true } },
        channel: { select: { id: true, name: true, code: true } },
        carrier: { select: { id: true, name: true, code: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, images: true } },
          },
        },
        packageVideos: {
          select: { id: true, processingStatus: true, thumbnailUrl: true },
        },
        _count: {
          select: { packageVideos: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(order => ({
      ...order,
      hasVideo: order._count.packageVideos > 0,
    })),
    total,
    page,
    limit,
  };
};

export const getOrderById = async (id: string, currentUser?: CurrentUser) => {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      shop: true,
      channel: true,
      carrier: true,
      items: {
        include: {
          product: true,
        },
      },
      packageVideos: true,
      receivingVideos: true,
      statusHistory: {
        orderBy: { createdAt: 'desc' },
        include: {
          changer: { select: { id: true, fullName: true } },
        },
      },
      returnRequests: true,
    },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Nếu user đang ở trong ngữ cảnh 1 shop thì chỉ xem được đơn của shop đó
  if (currentUser?.shopId && order.shopId !== currentUser.shopId) {
    throw forbidden('Bạn không được phép xem đơn hàng của shop khác');
  }

  if (currentUser?.roles.includes(RoleName.customer) && order.customerId && order.customerId !== currentUser.userId) {
    throw forbidden('Bạn không được phép xem đơn hàng này');
  }

  return order;
};

export const getOrderByTrackingCode = async (trackingCode: string) => {
  const order = await prisma.order.findFirst({
    where: { trackingCode },
    include: {
      items: {
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
      },
      packageVideos: {
        where: { processingStatus: 'completed' },
        select: {
          id: true,
          processedVideoUrl: true,
          thumbnailUrl: true,
          createdAt: true,
        },
      },
      carrier: { select: { name: true, code: true } },
    },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng với mã vận đơn này');
  }

  return {
    orderCode: order.orderCode,
    trackingCode: order.trackingCode,
    status: order.status,
    customerName: order.customerName,
    shippingAddress: order.shippingAddress,
    items: order.items,
    totalAmount: order.totalAmount,
    carrier: order.carrier,
    packageVideos: order.packageVideos,
    createdAt: order.createdAt,
    packedAt: order.packedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
  };
};

export const createOrder = async (data: CreateOrderDto, createdBy: string, currentUser?: CurrentUser) => {
  // Calculate totals
  let subtotal = 0;
  const items = data.items.map(item => {
    const totalPrice = item.unitPrice * item.quantity;
    subtotal += totalPrice;
    return {
      ...item,
      totalPrice,
    };
  });

  const totalAmount = subtotal - (data.discountAmount || 0) + (data.shippingFee || 0);

  // Xác định shopId hiệu lực
  const activeShopId = currentUser?.shopId ?? null;
  const effectiveShopId = activeShopId || data.shopId;

  if (!effectiveShopId) {
    throw badRequest('Đơn hàng phải thuộc một shop hợp lệ');
  }

  // Nếu đang quản lý shop A thì không được tạo đơn cho shop B
  if (activeShopId && data.shopId && data.shopId !== activeShopId) {
    throw forbidden('Bạn không được phép tạo đơn hàng cho shop khác');
  }

  // Create order
  const order = await prisma.order.create({
    data: {
      shopId: effectiveShopId,
      orderCode: generateOrderCode(),
      channelId: data.channelId,
      channelOrderId: data.channelOrderId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      shippingAddress: data.shippingAddress,
      shippingProvince: data.shippingProvince,
      shippingDistrict: data.shippingDistrict,
      shippingWard: data.shippingWard,
      carrierId: data.carrierId,
      trackingCode: data.trackingCode || generateTrackingCode(),
      shippingFee: data.shippingFee || 0,
      codAmount: data.codAmount || 0,
      subtotal,
      discountAmount: data.discountAmount || 0,
      totalAmount,
      paymentMethod: data.paymentMethod,
      notes: data.notes,
      createdBy,
      items: {
        create: items.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  // Create status history
  await prisma.orderStatusHistory.create({
    data: {
      orderId: order.id,
      status: 'pending',
      note: 'Đơn hàng được tạo',
      changedBy: createdBy,
    },
  });

  return getOrderById(order.id);
};

export const updateOrder = async (id: string, data: UpdateOrderDto) => {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Can only update pending/confirmed orders
  if (!['pending', 'confirmed'].includes(order.status)) {
    throw badRequest('Không thể cập nhật đơn hàng ở trạng thái này');
  }

  await prisma.order.update({
    where: { id },
    data: {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      shippingAddress: data.shippingAddress,
      shippingProvince: data.shippingProvince,
      shippingDistrict: data.shippingDistrict,
      shippingWard: data.shippingWard,
      carrierId: data.carrierId,
      trackingCode: data.trackingCode,
      shippingFee: data.shippingFee,
      codAmount: data.codAmount,
      notes: data.notes,
    },
  });

  return getOrderById(id);
};

export const updateOrderStatus = async (
  id: string,
  status: OrderStatus,
  changedBy: string,
  note?: string
) => {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    throw notFound('Không tìm thấy đơn hàng');
  }

  // Validate status transition
  const validTransitions: Record<string, string[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['packing', 'cancelled'],
    packing: ['packed', 'cancelled'],
    packed: ['shipping', 'cancelled'],
    shipping: ['delivered', 'returned'],
    delivered: ['completed', 'returned'],
    completed: [],
    cancelled: [],
    returned: [],
  };

  if (!validTransitions[order.status]?.includes(status)) {
    throw badRequest(`Không thể chuyển từ trạng thái ${order.status} sang ${status}`);
  }

  // Update timestamps
  const timestamps: any = {};
  switch (status) {
    case 'confirmed':
      timestamps.confirmedAt = new Date();
      break;
    case 'packed':
      timestamps.packedAt = new Date();
      break;
    case 'shipping':
      timestamps.shippedAt = new Date();
      break;
    case 'delivered':
      timestamps.deliveredAt = new Date();
      break;
    case 'completed':
      timestamps.completedAt = new Date();
      break;
    case 'cancelled':
      timestamps.cancelledAt = new Date();
      break;
  }

  await prisma.order.update({
    where: { id },
    data: {
      status,
      ...timestamps,
    },
  });

  // Create status history
  await prisma.orderStatusHistory.create({
    data: {
      orderId: id,
      status,
      note,
      changedBy,
    },
  });

  return getOrderById(id);
};

export const cancelOrder = async (id: string, cancelledBy: string) => {
  return updateOrderStatus(id, 'cancelled', cancelledBy, 'Đơn hàng bị hủy');
};

export const getOrderHistory = async (orderId: string) => {
  const history = await prisma.orderStatusHistory.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    include: {
      changer: { select: { id: true, fullName: true, email: true } },
    },
  });

  return history;
};

export const getOrderStats = async (shopId?: string, startDate?: string, endDate?: string) => {
  const where: any = {};
  
  if (shopId) {
    where.shopId = shopId;
  }

  const dateFilter = parseDateRange(startDate, endDate);
  if (dateFilter) {
    where.createdAt = dateFilter;
  }

  const [
    totalOrders,
    pendingOrders,
    packingOrders,
    shippingOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue,
  ] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, status: 'pending' } }),
    prisma.order.count({ where: { ...where, status: { in: ['packing', 'packed'] } } }),
    prisma.order.count({ where: { ...where, status: 'shipping' } }),
    prisma.order.count({ where: { ...where, status: 'completed' } }),
    prisma.order.count({ where: { ...where, status: 'cancelled' } }),
    prisma.order.aggregate({
      where: { ...where, status: 'completed' },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    totalOrders,
    pendingOrders,
    packingOrders,
    shippingOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue: totalRevenue._sum.totalAmount || 0,
  };
};
