import cron, { type ScheduledTask } from 'node-cron';
import prisma from '../config/database';
import * as reportService from '../modules/reports/reports.service';
import { sendDailyReport } from './email.service';

let scheduledJob: ScheduledTask | null = null;

export const startReportScheduler = () => {
  // Chạy mỗi ngày lúc 02:00 sáng theo giờ Việt Nam.
  scheduledJob = cron.schedule(
    '0 2 * * *',
    async () => {
      console.log('📧 [Cron] Starting daily report email job...');

      try {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);

        const dateStr = today.toLocaleDateString('vi-VN');

        const subscriptions = await prisma.reportSubscription.findMany({
          where: { enabled: true },
        });

        if (subscriptions.length === 0) {
          console.log('⚠️ [Cron] No email subscriptions found. Skipping report.');
          return;
        }

        const financialEmails: string[] = [];
        const operationalEmails: string[] = [];
        const bothEmails: string[] = [];

        subscriptions.forEach((sub) => {
          if (sub.reportType === 'financial') {
            financialEmails.push(sub.email);
          } else if (sub.reportType === 'operational') {
            operationalEmails.push(sub.email);
          } else if (sub.reportType === 'both') {
            bothEmails.push(sub.email);
          }
        });

        const [revenueReport, orderReport, dashboard] = await Promise.all([
          reportService.getRevenueReport({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
          reportService.getOrderReport({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
          reportService.getDashboard({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          }),
        ]);

        const financialRecipients = [...financialEmails, ...bothEmails];
        if (financialRecipients.length > 0) {
          await sendDailyReport(financialRecipients, {
            date: dateStr,
            financial: {
              totalRevenue: revenueReport.summary.totalRevenue,
              orderCount: revenueReport.summary.orderCount,
              averageOrderValue: revenueReport.summary.averageOrderValue,
              byChannel: revenueReport.byChannel,
            },
          });
        }

        const operationalRecipients = [...operationalEmails, ...bothEmails];
        if (operationalRecipients.length > 0) {
          const ordersWithoutVideo = dashboard.summary.orders.total - dashboard.summary.videos.total;

          await sendDailyReport(operationalRecipients, {
            date: dateStr,
            operational: {
              totalOrders: dashboard.summary.orders.total,
              processedVideos: dashboard.summary.videos.processed,
              ordersWithoutVideo: ordersWithoutVideo > 0 ? ordersWithoutVideo : 0,
              byStatus: orderReport.byStatus,
            },
          });
        }

        console.log('✅ [Cron] Daily report emails sent successfully');
      } catch (error) {
        console.error('❌ [Cron] Failed to send daily reports:', error);
      }
    },
    {
      timezone: 'Asia/Ho_Chi_Minh',
    }
  );

  console.log('✅ Report scheduler started (runs daily at 02:00 VN time)');
};

export const stopReportScheduler = () => {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
    console.log('⏹️ Report scheduler stopped');
  }
};
