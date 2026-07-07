import 'dotenv/config';
import app from './app';
import { initEmailService } from './services/email.service';
import { startReportScheduler } from './services/report-scheduler.service';
import { startVideoUploadMonitor } from './services/video-upload-monitor.service';
import { startShopeeTokenRefresh } from './services/shopee-token-refresh.service';
import { startTikTokTokenRefresh } from './services/tiktok-token-refresh.service';
import { startReturnSyncScheduler } from './services/return-sync-scheduler.service';
import { startOrderSyncScheduler } from './services/order-sync-scheduler.service';
import { initBarcodeMapCache } from './modules/capture/barcode-mapping.service';

const PORT = process.env.PORT || 3000;

// Initialize email service
initEmailService();

// Load barcode -> SKU mapping cache (migrates legacy JSON file into DB on first run)
initBarcodeMapCache();

// Start report scheduler (sends daily reports at 18:00)
startReportScheduler();

// Start background job to monitor stale video uploads on S3
startVideoUploadMonitor();

// Refresh Shopee access tokens before their four-hour lifetime expires.
startShopeeTokenRefresh();

// Refresh TikTok Shop access tokens before they expire (mirrors Shopee's refresh job).
startTikTokTokenRefresh();

// Silently poll TikTok/Shopee for return updates and keep Order/ReturnRequest in sync.
startReturnSyncScheduler();

// Silently pull new orders/products from TikTok/Shopee — no manual "Đồng bộ" button needed anymore.
startOrderSyncScheduler();

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});
