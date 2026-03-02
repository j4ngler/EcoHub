import api from './axios';

export interface ReportSubscription {
  id: string;
  shopId?: string;
  email: string;
  reportType: 'financial' | 'operational' | 'both';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const settingsApi = {
  /** shopId: ngữ cảnh shop (từ header/assume) hoặc Super Admin truyền để xem cài đặt theo shop) */
  getReportSubscriptions: async (shopId?: string | null): Promise<ReportSubscription[]> => {
    const params = shopId ? { shopId } : {};
    const response = await api.get('/settings/report-subscriptions', { params });
    return response.data.data;
  },

  createReportSubscription: async (data: {
    email: string;
    reportType: 'financial' | 'operational' | 'both';
    enabled?: boolean;
    shopId?: string | null;
  }): Promise<ReportSubscription> => {
    const response = await api.post('/settings/report-subscriptions', data);
    return response.data.data;
  },

  updateReportSubscription: async (
    id: string,
    data: {
      enabled?: boolean;
      reportType?: 'financial' | 'operational' | 'both';
    }
  ): Promise<ReportSubscription> => {
    const response = await api.put(`/settings/report-subscriptions/${id}`, data);
    return response.data.data;
  },

  deleteReportSubscription: async (id: string): Promise<void> => {
    await api.delete(`/settings/report-subscriptions/${id}`);
  },
};
