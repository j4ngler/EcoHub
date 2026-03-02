import cron, { type ScheduledTask } from 'node-cron';
import { cleanupStaleUploads } from '../modules/videos/videos.s3.service';

let uploadMonitorJob: ScheduledTask | null = null;

export const startVideoUploadMonitor = () => {
  // Chạy mỗi 5 phút để kiểm tra các video đang UPLOADING quá lâu
  uploadMonitorJob = cron.schedule(
    '*/5 * * * *',
    async () => {
      try {
        console.log('🎥 [Cron] Checking stale video uploads...');
        const result = await cleanupStaleUploads(30);
        console.log(
          `🎥 [Cron] Video upload monitor checked=${result.checked}, markedFailed=${result.markedFailed}`
        );
      } catch (error) {
        console.error('❌ [Cron] Failed to run video upload monitor:', error);
      }
    },
    {
      timezone: 'Asia/Ho_Chi_Minh',
    }
  );

  console.log('✅ Video upload monitor started (runs every 5 minutes)');
};

export const stopVideoUploadMonitor = () => {
  if (uploadMonitorJob) {
    uploadMonitorJob.stop();
    uploadMonitorJob = null;
    console.log('⏹️ Video upload monitor stopped');
  }
};

