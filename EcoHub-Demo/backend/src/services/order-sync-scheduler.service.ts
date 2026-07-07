import cron, { type ScheduledTask } from 'node-cron';
import prisma from '../config/database';
import { syncOrdersForConnection, syncProductsForConnection } from '../modules/channels/tiktok-sync.service';
import { syncShopeeOrdersForConnection, syncShopeeProductsForConnection } from '../modules/channels/shopee-sync.service';

let job: ScheduledTask | null = null;

// Every 15 minutes by default — override with ORDER_SYNC_CRON if a different cadence is needed.
const ORDER_SYNC_CRON = (process.env.ORDER_SYNC_CRON || '*/15 * * * *').trim();

const runOrderSync = async () => {
  const connections = await prisma.shopChannelConnection.findMany({
    where: { status: 'connected', channel: { code: { in: ['tiktok', 'shopee'] } } },
    include: { channel: true, shop: true },
  });

  for (const connection of connections) {
    // Đơn/sản phẩm đồng bộ tự động cần gán cho 1 user thật (Product.createdBy có FK tới User) —
    // dùng chủ shop làm người tạo mặc định.
    const userId = connection.shop?.ownerId || '';
    if (!userId) continue;

    try {
      if (connection.channel.code === 'tiktok') {
        await syncOrdersForConnection(connection, userId);
        await syncProductsForConnection(connection, userId);
      } else if (connection.channel.code === 'shopee') {
        await syncShopeeOrdersForConnection(connection, userId);
        await syncShopeeProductsForConnection(connection, userId);
      }
    } catch (error) {
      // Silent by design — chạy nền tự động, không có UI để báo lỗi cho ai.
      console.warn(
        `[Order sync] connection ${connection.id} (${connection.channel.code}) failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
};

export const startOrderSyncScheduler = () => {
  if (job || process.env.ORDER_SYNC_ENABLED === 'false') return job;

  job = cron.schedule(ORDER_SYNC_CRON, () => {
    runOrderSync().catch((error) => console.error('[Order sync] Job failed:', error));
  });

  return job;
};
