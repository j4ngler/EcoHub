import 'dotenv/config';
import app from './app';
import { initEmailService } from './services/email.service';
import { startReportScheduler } from './services/report-scheduler.service';
import { startVideoUploadMonitor } from './services/video-upload-monitor.service';
import { startShopeeTokenRefresh } from './services/shopee-token-refresh.service';

const PORT = process.env.PORT || 3000;

// Initialize email service
initEmailService();

// Start report scheduler (sends daily reports at 18:00)
startReportScheduler();

// Start background job to monitor stale video uploads on S3
startVideoUploadMonitor();

// Refresh Shopee access tokens before their four-hour lifetime expires.
startShopeeTokenRefresh();

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
