import prisma from '../config/database';
import { OrderStatus, PaymentStatus } from '@prisma/client';

// Demo data cho Shopee orders
const DEMO_SHOPEE_ORDERS = [
  {
    channelOrderId: 'SP-20260129-001',
    customerName: 'Nguyễn Văn A',
    customerPhone: '0912345678',
    customerEmail: 'nguyenvana@example.com',
    shippingAddress: '123 Đường ABC, Quận 1, TP.HCM',
    items: [
      { name: 'Áo thun nam', sku: 'SP-TSHIRT-001', quantity: 2, price: 150000 },
      { name: 'Quần jean', sku: 'SP-JEAN-001', quantity: 1, price: 350000 },
    ],
    shippingFee: 30000,
    codAmount: 680000,
  },
  {
    channelOrderId: 'SP-20260129-002',
    customerName: 'Trần Thị B',
    customerPhone: '0987654321',
    customerEmail: 'tranthib@example.com',
    shippingAddress: '456 Đường XYZ, Quận 3, TP.HCM',
    items: [{ name: 'Giày thể thao', sku: 'SP-SHOE-001', quantity: 1, price: 500000 }],
    shippingFee: 30000,
    codAmount: 530000,
  },
];

// Demo data cho TikTok orders
const DEMO_TIKTOK_ORDERS = [
  {
    channelOrderId: 'TT-20260129-001',
    customerName: 'Lê Văn C',
    customerPhone: '0923456789',
    customerEmail: 'levanc@example.com',
    shippingAddress: '789 Đường DEF, Quận 7, TP.HCM',
    items: [
      { name: 'Túi xách nữ', sku: 'TT-BAG-001', quantity: 1, price: 250000 },
      { name: 'Ví da', sku: 'TT-WALLET-001', quantity: 1, price: 180000 },
    ],
    shippingFee: 30000,
    codAmount: 460000,
  },
  {
    channelOrderId: 'TT-20260129-002',
    customerName: 'Phạm Thị D',
    customerPhone: '0934567890',
    customerEmail: 'phamthid@example.com',
    shippingAddress: '321 Đường GHI, Quận 10, TP.HCM',
    items: [{ name: 'Đồng hồ thông minh', sku: 'TT-WATCH-001', quantity: 1, price: 1200000 }],
    shippingFee: 30000,
    codAmount: 1230000,
  },
];

export const syncDemoShopeeOrders = async (shopId: string, channelId: string, userId: string) => {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error('Shop not found');
  }

  const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.code !== 'shopee') {
    throw new Error('Invalid channel');
  }

  let created = 0;
  let updated = 0;

  for (const demoOrder of DEMO_SHOPEE_ORDERS) {
    const subtotal = demoOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = subtotal + demoOrder.shippingFee;

    // Check if order already exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderCode: demoOrder.channelOrderId },
    });

    if (existingOrder) {
      // Update existing order
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          totalAmount: subtotal + demoOrder.shippingFee,
          updatedAt: new Date(),
        },
      });
      updated++;
    } else {
      // Create new order
      const order = await prisma.order.create({
        data: {
          shopId,
          orderCode: demoOrder.channelOrderId,
          channelId,
          channelOrderId: demoOrder.channelOrderId,
          customerName: demoOrder.customerName,
          customerPhone: demoOrder.customerPhone,
          customerEmail: demoOrder.customerEmail,
          shippingAddress: demoOrder.shippingAddress,
          shippingFee: demoOrder.shippingFee,
          codAmount: demoOrder.codAmount,
          subtotal,
          totalAmount,
          status: OrderStatus.pending,
          paymentStatus: PaymentStatus.pending,
          paymentMethod: 'COD',
          createdBy: userId,
        },
      });

      // Create order items
      for (const item of demoOrder.items) {
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productName: item.name,
            productSku: item.sku,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          },
        });
      }

      created++;
    }
  }

  // Update last sync time
  await prisma.shopChannelConnection.updateMany({
    where: { shopId, channelId },
    data: { lastSyncAt: new Date() },
  });

  return {
    channel: channel.name,
    synced: DEMO_SHOPEE_ORDERS.length,
    created,
    updated,
    failed: 0,
    lastSyncAt: new Date(),
  };
};

export const syncDemoTikTokOrders = async (shopId: string, channelId: string, userId: string) => {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) {
    throw new Error('Shop not found');
  }

  const channel = await prisma.salesChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.code !== 'tiktok') {
    throw new Error('Invalid channel');
  }

  let created = 0;
  let updated = 0;

  for (const demoOrder of DEMO_TIKTOK_ORDERS) {
    const subtotal = demoOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalAmount = subtotal + demoOrder.shippingFee;

    // Check if order already exists
    const existingOrder = await prisma.order.findUnique({
      where: { orderCode: demoOrder.channelOrderId },
    });

    if (existingOrder) {
      // Update existing order
      await prisma.order.update({
        where: { id: existingOrder.id },
        data: {
          totalAmount: subtotal + demoOrder.shippingFee,
          updatedAt: new Date(),
        },
      });
      updated++;
    } else {
      // Create new order
      const order = await prisma.order.create({
        data: {
          shopId,
          orderCode: demoOrder.channelOrderId,
          channelId,
          channelOrderId: demoOrder.channelOrderId,
          customerName: demoOrder.customerName,
          customerPhone: demoOrder.customerPhone,
          customerEmail: demoOrder.customerEmail,
          shippingAddress: demoOrder.shippingAddress,
          shippingFee: demoOrder.shippingFee,
          codAmount: demoOrder.codAmount,
          subtotal,
          totalAmount,
          status: OrderStatus.pending,
          paymentStatus: PaymentStatus.pending,
          paymentMethod: 'COD',
          createdBy: userId,
        },
      });

      // Create order items
      for (const item of demoOrder.items) {
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            productName: item.name,
            productSku: item.sku,
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.price * item.quantity,
          },
        });
      }

      created++;
    }
  }

  // Update last sync time
  await prisma.shopChannelConnection.updateMany({
    where: { shopId, channelId },
    data: { lastSyncAt: new Date() },
  });

  return {
    channel: channel.name,
    synced: DEMO_TIKTOK_ORDERS.length,
    created,
    updated,
    failed: 0,
    lastSyncAt: new Date(),
  };
};
