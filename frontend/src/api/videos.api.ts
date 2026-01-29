import api from './axios';

export interface PackageVideo {
  id: string;
  orderId: string;
  trackingCode: string;
  originalVideoUrl: string;
  originalVideoSize?: number | string | bigint;
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

export interface VideosResponse {
  data: PackageVideo[];
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
};
