import api from './axios';

export interface DashboardData {
  summary: {
    orders: {
      total: number;
      pending: number;
      packing: number;
      shipping: number;
      completed: number;
      cancelled: number;
    };
    videos: {
      total: number;
      processed: number;
      pending: number;
    };
    products: {
      total: number;
      lowStock: number;
    };
    revenue: {
      total: number;
      average: number;
    };
  };
  recentOrders: Array<{
    id: string;
    orderCode: string;
    customerName: string;
    totalAmount: number;
    status: string;
    createdAt: string;
  }>;
  ordersByStatus: Array<{
    status: string;
    count: number;
  }>;
}

export interface ReportParams {
  shopId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}

export const reportsApi = {
  getDashboard: async (params?: ReportParams): Promise<DashboardData> => {
    const response = await api.get('/reports/dashboard', { params });
    return response.data.data;
  },
  
  getOrderReport: async (params?: ReportParams) => {
    const response = await api.get('/reports/orders', { params });
    return response.data.data;
  },
  
  getVideoReport: async (params?: ReportParams) => {
    const response = await api.get('/reports/videos', { params });
    return response.data.data;
  },
  
  getRevenueReport: async (params?: ReportParams) => {
    const response = await api.get('/reports/revenue', { params });
    return response.data.data;
  },
  
  getStaffPerformance: async (params?: ReportParams) => {
    const response = await api.get('/reports/staff-performance', { params });
    return response.data.data;
  },
};
