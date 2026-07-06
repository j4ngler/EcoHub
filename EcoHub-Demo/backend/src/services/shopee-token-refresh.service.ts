import cron, { type ScheduledTask } from 'node-cron';
import { refreshExpiringShopeeConnections } from '../modules/channels/channels.service';

let refreshJob: ScheduledTask | null = null;

export const startShopeeTokenRefresh = () => {
  if (refreshJob || process.env.SHOPEE_TOKEN_REFRESH_ENABLED === 'false') return refreshJob;

  refreshJob = cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await refreshExpiringShopeeConnections();
      if (result.refreshed || result.failed) {
        console.log('[Shopee token refresh]', result);
      }
    } catch (error) {
      console.error('[Shopee token refresh] Job failed:', error);
    }
  });

  return refreshJob;
};
