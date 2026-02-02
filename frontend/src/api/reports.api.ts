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
    storage: {
      totalBytes: number;
      usedBytes: number;
      usedPercent: number;
      status: 'ok' | 'warning' | 'critical';
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
  storage?: {
    largestVideos: Array<{
      id: string;
      trackingCode: string;
      createdAt: string;
      orderId: string;
      orderCode: string;
      totalSizeBytes: number;
    }>;
  };
}

export interface ReportParams {
  shopId?: string;
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}

export interface OperationalDailyRow {
  date: string; // YYYY-MM-DD
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
    failed: number;
  };
  receivingVideos: {
    total: number;
  };
}

export interface OperationalReportData {
  range: { startDate: string; endDate: string };
  daily: OperationalDailyRow[];
}

export interface SyncNowResult {
  startedAt: string;
  finishedAt: string;
  connections: number;
  total: { synced: number; created: number; updated: number; failed: number };
  results: Array<{
    shopId: string;
    shopName: string;
    channelCode: string;
    channelName: string;
    synced: number;
    created: number;
    updated: number;
    failed: number;
    lastSyncAt: string;
    error?: string;
  }>;
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

  getOperationalReport: async (params?: ReportParams): Promise<OperationalReportData> => {
    const response = await api.get('/reports/operational', { params });
    return response.data.data;
  },

  syncNow: async (channels?: Array<'shopee' | 'tiktok'>): Promise<SyncNowResult> => {
    const response = await api.post('/reports/sync-now', { channels });
    return response.data.data;
  },

  exportReport: async (params?: ReportParams & { type?: string; format?: string }) => {
    const response = await api.get('/reports/export', { params });
    return response.data.data;
  },
};
