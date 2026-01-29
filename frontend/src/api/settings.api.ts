import api from './axios';

export interface ReportSubscription {
  id: string;
  email: string;
  reportType: 'financial' | 'operational' | 'both';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const settingsApi = {
  getReportSubscriptions: async (): Promise<ReportSubscription[]> => {
    const response = await api.get('/settings/report-subscriptions');
    return response.data.data;
  },

  createReportSubscription: async (data: {
    email: string;
    reportType: 'financial' | 'operational' | 'both';
    enabled?: boolean;
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
