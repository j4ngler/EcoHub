import nodemailer from 'nodemailer';
import { env } from '../config/environment';

let transporter: nodemailer.Transporter | null = null;

export const initEmailService = () => {
  if (!env.MAIL_HOST || !env.MAIL_USERNAME || !env.MAIL_PASSWORD) {
    console.warn('⚠️ Email service not configured. Email features will be disabled.');
    return;
  }

  const port = parseInt(env.MAIL_PORT || '465');
  const useTLS = env.MAIL_ENCRYPTION === 'tls' || port === 587;
  const useSSL = port === 465 || env.MAIL_ENCRYPTION === 'ssl';

  transporter = nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: port,
    secure: useSSL, // true for 465, false for other ports
    auth: {
      user: env.MAIL_USERNAME,
      pass: env.MAIL_PASSWORD,
    },
    tls: useTLS ? { rejectUnauthorized: false } : undefined,
  });

  console.log('✅ Email service initialized');
};

export const sendEmail = async (options: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}) => {
  if (!transporter) {
    console.warn('Email service not initialized. Skipping email send.');
    return false;
  }

  try {
    const fromAddress = env.MAIL_FROM_ADDRESS || env.MAIL_USERNAME || 'noreply@ecohub.vn';
    const fromName = env.MAIL_FROM_NAME || 'EcoHub';

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''),
      replyTo: env.MAIL_REPLY_ADDRESS || fromAddress,
    });

    console.log(`✅ Email sent to: ${Array.isArray(options.to) ? options.to.join(', ') : options.to}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    return false;
  }
};

export const sendDailyReport = async (
  emails: string[],
  reportData: {
    date: string;
    financial?: any;
    operational?: any;
  }
) => {
  if (emails.length === 0) {
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
        .section { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .section h2 { color: #059669; margin-top: 0; }
        .stat { display: inline-block; margin: 10px 20px 10px 0; }
        .stat-label { font-size: 12px; color: #6b7280; }
        .stat-value { font-size: 24px; font-weight: bold; color: #111827; }
        .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { background: #f3f4f6; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Báo cáo hàng ngày - EcoHub</h1>
          <p>Ngày: ${reportData.date}</p>
        </div>
        <div class="content">
          ${reportData.financial ? `
            <div class="section">
              <h2>💰 Báo cáo Tài chính</h2>
              <div class="stat">
                <div class="stat-label">Tổng doanh thu</div>
                <div class="stat-value">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(reportData.financial.totalRevenue || 0)}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Số đơn hàng</div>
                <div class="stat-value">${reportData.financial.orderCount || 0}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Giá trị đơn TB</div>
                <div class="stat-value">${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(reportData.financial.averageOrderValue || 0)}</div>
              </div>
              ${reportData.financial.byChannel && reportData.financial.byChannel.length > 0 ? `
                <h3 style="margin-top: 20px;">Doanh thu theo sàn:</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Sàn</th>
                      <th>Doanh thu</th>
                      <th>Số đơn</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${reportData.financial.byChannel.map((ch: any) => `
                      <tr>
                        <td>${ch.channelName}</td>
                        <td>${new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(ch.revenue || 0)}</td>
                        <td>${ch.orderCount || 0}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
            </div>
          ` : ''}
          
          ${reportData.operational ? `
            <div class="section">
              <h2>📦 Báo cáo Vận hành</h2>
              <div class="stat">
                <div class="stat-label">Tổng đơn hàng</div>
                <div class="stat-value">${reportData.operational.totalOrders || 0}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Video đã xử lý</div>
                <div class="stat-value">${reportData.operational.processedVideos || 0}</div>
              </div>
              <div class="stat">
                <div class="stat-label">Đơn chưa đóng gói</div>
                <div class="stat-value">${reportData.operational.ordersWithoutVideo || 0}</div>
              </div>
              ${reportData.operational.byStatus && reportData.operational.byStatus.length > 0 ? `
                <h3 style="margin-top: 20px;">Đơn hàng theo trạng thái:</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Trạng thái</th>
                      <th>Số lượng</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${reportData.operational.byStatus.map((s: any) => `
                      <tr>
                        <td>${s.status}</td>
                        <td>${s.count}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="footer">
            <p>Báo cáo tự động từ hệ thống EcoHub</p>
            <p>Để xem chi tiết, vui lòng đăng nhập vào hệ thống.</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: emails,
    subject: `Báo cáo hàng ngày EcoHub - ${reportData.date}`,
    html,
  });
};
