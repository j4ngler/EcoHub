import api from './axios';

export interface PackageVideo {
  id: string;
  orderId: string;
  trackingCode: string;
  originalVideoUrl: string;
  originalVideoSize?: number | string | bigint;
  originalDuration?: number | null;
  processedVideoUrl?: string;
  processedVideoSize?: number | string | bigint;
  thumbnailUrl?: string;
  processingStatus: string;
  processingError?: string;
  trackingCodePosition: string;
  recordedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  deletedAt?: string;
  createdAt: string;
  order?: {
    id: string;
    orderCode: string;
    customerName: string;
    status: string;
  };
  recorder?: { id: string; fullName: string };
  approver?: { id: string; fullName: string };
}

export interface ReceivingVideo {
  id: string;
  orderId: string;
  customerId: string;
  trackingCode: string;
  videoUrl: string;
  videoSize?: number | string | bigint | null;
  duration?: number | null;
  thumbnailUrl?: string | null;
  packageVideoId?: string | null;
  comparisonStatus: 'pending' | 'matched' | 'mismatched' | 'disputed';
  comparisonNotes?: string | null;
  recordedAt?: string | null;
  createdAt: string;
  order?: {
    id: string;
    orderCode: string;
    customerName?: string | null;
    status: string;
    trackingCode?: string | null;
  };
  customer?: {
    id: string;
    fullName: string;
    email?: string;
  };
  packageVideo?: {
    id: string;
    trackingCode: string;
    processedVideoUrl?: string | null;
    originalVideoUrl?: string | null;
  };
}

export interface PublicTrackingDetail {
  order: {
    id: string;
    orderCode: string;
    channelOrderId?: string | null;
    trackingCode?: string | null;
    status: string;
    customerName: string;
    carrier?: { name: string; code: string } | null;
    items: Array<{
      productName: string;
      productSku?: string | null;
      quantity: number;
    }>;
    packedAt?: string | null;
    shippedAt?: string | null;
    deliveredAt?: string | null;
    createdAt: string;
  };
  packageVideos: Array<{
    id: string;
    trackingCode: string;
    processedVideoUrl?: string | null;
    originalVideoUrl: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    createdAt: string;
  }>;
  receivingVideos: Array<{
    id: string;
    trackingCode: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    comparisonStatus: string;
    comparisonNotes?: string | null;
    recordedAt?: string | null;
    createdAt: string;
  }>;
}

export interface VideosResponse {
  data: PackageVideo[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ReceivingVideosResponse {
  data: ReceivingVideo[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface VideoQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  orderId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  showDeleted?: boolean;
}

export interface ReceivingVideoQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  orderId?: string;
  comparisonStatus?: 'pending' | 'matched' | 'mismatched' | 'disputed';
}

export const videosApi = {
  getVideos: async (params: VideoQueryParams): Promise<VideosResponse> => {
    // Bỏ các field rỗng/undefined để tránh gửi `status=` gây lỗi Zod ở backend
    const cleanedParams: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedParams[key] = value;
      }
    });

    const response = await api.get('/videos', { params: cleanedParams });
    return response.data;
  },

  getVideoById: async (id: string): Promise<PackageVideo> => {
    const response = await api.get(`/videos/${id}`);
    return response.data.data;
  },

  getVideoByTrackingCode: async (trackingCode: string): Promise<PackageVideo[]> => {
    const response = await api.get(`/videos/tracking/${trackingCode}`);
    return response.data.data;
  },

  getPublicTrackingDetail: async (code: string): Promise<PublicTrackingDetail> => {
    const response = await api.get(`/videos/public/tracking/${code}`);
    return response.data.data;
  },

  uploadPublicReceivingVideo: async (code: string, data: FormData): Promise<ReceivingVideo> => {
    const response = await api.post(`/videos/public/tracking/${code}/receiving`, data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  getVideosByOrder: async (orderId: string): Promise<PackageVideo[]> => {
    const response = await api.get(`/videos/order/${orderId}`);
    return response.data.data;
  },

  uploadVideo: async (data: FormData): Promise<PackageVideo> => {
    const response = await api.post('/videos/upload', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  getReceivingVideos: async (params: ReceivingVideoQueryParams): Promise<ReceivingVideosResponse> => {
    const cleanedParams: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedParams[key] = value;
      }
    });

    const response = await api.get('/videos/receiving', { params: cleanedParams });
    return response.data;
  },

  uploadReceivingVideo: async (data: FormData): Promise<ReceivingVideo> => {
    const response = await api.post('/videos/receiving/upload', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data.data;
  },

  approveVideo: async (id: string): Promise<PackageVideo> => {
    const response = await api.put(`/videos/${id}/approve`);
    return response.data.data;
  },

  deleteVideo: async (id: string): Promise<void> => {
    await api.delete(`/videos/${id}`);
  },

  compareVideos: async (packageVideoId: string) => {
    const response = await api.get(`/videos/${packageVideoId}/compare`);
    return response.data.data;
  },

  updateReceivingVideo: async (
    id: string,
    data: { comparisonStatus?: string; comparisonNotes?: string }
  ): Promise<ReceivingVideo> => {
    const response = await api.patch(`/videos/receiving/${id}`, data);
    return response.data.data;
  },
};
