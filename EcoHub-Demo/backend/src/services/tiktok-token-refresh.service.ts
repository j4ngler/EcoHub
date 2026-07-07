import cron, { type ScheduledTask } from 'node-cron';
import { refreshExpiringTikTokConnections } from '../modules/channels/channels.service';

let refreshJob: ScheduledTask | null = null;

export const startTikTokTokenRefresh = () => {
  if (refreshJob || process.env.TIKTOK_TOKEN_REFRESH_ENABLED === 'false') return refreshJob;

  refreshJob = cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await refreshExpiringTikTokConnections();
      if (result.refreshed || result.failed) {
        console.log('[TikTok token refresh]', result);
      }
    } catch (error) {
      console.error('[TikTok token refresh] Job failed:', error);
    }
  });

  return refreshJob;
};
