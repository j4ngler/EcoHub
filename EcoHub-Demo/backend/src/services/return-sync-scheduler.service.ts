import cron, { type ScheduledTask } from 'node-cron';
import prisma from '../config/database';
import { syncReturnsForConnection } from '../modules/channels/tiktok-sync.service';
import { syncShopeeReturnsForConnection } from '../modules/channels/shopee-sync.service';

let job: ScheduledTask | null = null;

// Every 30 minutes by default — override with RETURN_SYNC_CRON if a different cadence is needed.
const RETURN_SYNC_CRON = (process.env.RETURN_SYNC_CRON || '*/30 * * * *').trim();

const runReturnSync = async () => {
  const connections = await prisma.shopChannelConnection.findMany({
    where: { status: 'connected', channel: { code: { in: ['tiktok', 'shopee'] } } },
    include: { channel: true },
  });

  for (const connection of connections) {
    try {
      if (connection.channel.code === 'tiktok') {
        await syncReturnsForConnection(connection, '');
      } else if (connection.channel.code === 'shopee') {
        await syncShopeeReturnsForConnection(connection, '');
      }
    } catch (error) {
      // Silent by design — this runs unattended in the background, no UI to report to.
      console.warn(
        `[Return sync] connection ${connection.id} (${connection.channel.code}) failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
};

export const startReturnSyncScheduler = () => {
  if (job || process.env.RETURN_SYNC_ENABLED === 'false') return job;

  job = cron.schedule(RETURN_SYNC_CRON, () => {
    runReturnSync().catch((error) => console.error('[Return sync] Job failed:', error));
  });

  return job;
};
