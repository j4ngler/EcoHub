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
  packingStatus?: string;
  shippingReturnStatus?: string;
  videoStatus?: string;
  recordedBy?: string;
}

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

const canManageOrdersAcrossShops = (currentUser?: CurrentUser) =>
  Boolean(
    currentUser?.roles.includes(RoleName.super_admin) ||
      currentUser?.roles.includes(RoleName.admin) ||
      currentUser?.roles.includes(RoleName.customer_service)
  );

// Shipper cần tra cứu đơn của nhiều khách hàng khác nhau (đơn đang giao), không có khái niệm
// "sở hữu đơn" hay "thuộc 1 shop cố định" như customer/admin thông thường.
const canViewAnyOrderRegardlessOfOwnership = (currentUser?: CurrentUser) =>
  Boolean(canManageOrdersAcrossShops(currentUser) || currentUser?.roles.includes(RoleName.shipper));

export const getOrders = async (params: GetOrdersParams, currentUser?: CurrentUser) => {
  const { page, limit, skip } = getPagination(params.page, params.limit);

  const where: any = {};
  const andFilters: any[] = [];
  const isGlobalUser = canManageOrdersAcrossShops(currentUser);

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
  // Nếu user có shopId (như Admin/Staff) => giới hạn trong shop đó
  // Nếu là tài khoản toàn cục (Super Admin/CSKH) => có thể xem mọi shop hoặc lọc theo shopId cụ thể
  if (!isGlobalUser && currentUser?.shopId) {
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

  if (params.packingStatus === 'unpacked') {
    andFilters.push({ packageVideos: { none: { deletedAt: null } } });
  } else if (params.packingStatus === 'packing') {
    andFilters.push({ status: 'packing' });
  } else if (params.packingStatus === 'packed') {
    andFilters.push({
      OR: [
        { status: { in: ['packed', 'shipping', 'delivered', 'completed', 'returned'] } },
        { packageVideos: { some: { deletedAt: null } } },
      ],
    });
  }

  if (params.shippingReturnStatus === 'not_shipped') {
    andFilters.push({ status: { in: ['pending', 'confirmed', 'packing', 'packed'] } });
  } else if (params.shippingReturnStatus === 'shipping') {
    andFilters.push({ status: 'shipping' });
  } else if (params.shippingReturnStatus === 'delivered') {
    andFilters.push({ status: { in: ['delivered', 'completed'] } });
  } else if (params.shippingReturnStatus === 'returned') {
    andFilters.push({ status: 'returned' });
  }

  if (params.videoStatus === 'with_video') {
    andFilters.push({ packageVideos: { some: { deletedAt: null } } });
  } else if (params.videoStatus === 'without_video') {
    andFilters.push({ packageVideos: { none: { deletedAt: null } } });
  } else if (params.videoStatus === 'processing') {
    andFilters.push({ packageVideos: { some: { deletedAt: null, processingStatus: { in: ['uploaded', 'processing'] } } } });
  } else if (params.videoStatus === 'completed') {
    andFilters.push({ packageVideos: { some: { deletedAt: null, processingStatus: 'completed' } } });
  }

  if (params.recordedBy) {
    andFilters.push({ packageVideos: { some: { deletedAt: null, recordedBy: params.recordedBy } } });
  }

  // Nếu là customer, chỉ cho xem các đơn hàng của chính họ
  if (currentUser?.roles.includes(RoleName.customer)) {
    where.customerId = currentUser.userId;
  }

  if (andFilters.length > 0) {
    where.AND = andFilters;
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
          where: { deletedAt: null },
          select: {
            id: true,
            trackingCode: true,
            processingStatus: true,
            thumbnailUrl: true,
            recordedBy: true,
            createdAt: true,
            recorder: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
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
      hasVideo: order.packageVideos.length > 0,
    })),
    total,
    page,
    limit,
  };
};

export const getOrderById = async (id: string, currentUser?: CurrentUser) => {
  const isGlobalUser = canViewAnyOrderRegardlessOfOwnership(currentUser);

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
  if (!isGlobalUser && currentUser?.shopId && order.shopId !== currentUser.shopId) {
    throw forbidden('Bạn không được phép xem đơn hàng của shop khác');
  }

  if (currentUser?.roles.includes(RoleName.customer) && order.customerId && order.customerId !== currentUser.userId) {
    throw forbidden('Bạn không được phép xem đơn hàng này');
  }

  return order;
};

// Dùng cho tab "Tra cứu đơn hàng" trong giao diện đã đăng nhập (customer quét QR/nhập mã).
// Tái sử dụng nguyên vẹn quy tắc phân quyền của getOrderById: customer chỉ xem được đơn của chính mình.
export const lookupOrderByCode = async (code: string, currentUser?: CurrentUser) => {
  const normalized = code.trim();
  if (!normalized) {
    throw badRequest('Vui lòng nhập hoặc quét mã đơn hàng');
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { trackingCode: normalized },
        { orderCode: normalized },
        { channelOrderId: normalized },
      ],
    },
    select: { id: true },
  });

  if (!order) {
    throw notFound('Không tìm thấy đơn hàng với mã này');
  }

  return getOrderById(order.id, currentUser);
};

export const getOrderByTrackingCode = async (trackingCode: string, currentUser?: CurrentUser) => {
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

  // Permission check for packaging staff
  if (currentUser && currentUser.roles.includes(RoleName.staff)) {
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

  return {
    id: order.id,
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

export const getOrderStats = async (
  shopId?: string,
  startDate?: string,
  endDate?: string,
  currentUser?: CurrentUser
) => {
  const where: any = {};
  
  const isGlobalUser = canManageOrdersAcrossShops(currentUser);

  if (!isGlobalUser && currentUser?.shopId) {
    where.shopId = currentUser.shopId;
  } else if (shopId) {
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
