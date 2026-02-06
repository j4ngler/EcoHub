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

export type VideoModule = 'packaging' | 'receiving' | 'other';
export type S3VideoStatus = 'UPLOADING' | 'READY' | 'FAILED' | 'DELETED';

export interface S3Video {
  id: string;
  shopId: string;
  orderId: string;
  uploaderUserId: string;
  module: VideoModule;
  s3Bucket: string;
  s3Key: string;
  contentType: string;
  sizeBytes?: number | string | bigint | null;
  durationSec?: number | null;
  status: S3VideoStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  uploadedAt?: string | null;
  order?: {
    id: string;
    orderCode: string;
    trackingCode?: string | null;
    status: string;
    customerName?: string | null;
  };
  uploader?: {
    id: string;
    fullName: string;
    email: string;
  };
}

export interface S3VideosResponse {
  data: S3Video[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface S3VideoQueryParams {
  page?: number;
  limit?: number;
  shopId?: string;
  uploaderUserId?: string;
  orderId?: string;
  module?: VideoModule;
  status?: S3VideoStatus;
  startDate?: string;
  endDate?: string;
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

  // ===== S3 based upload pipeline =====
  initS3Upload: async (payload: {
    orderId: string;
    module: VideoModule;
    contentType?: string;
    fileName?: string;
    sizeBytes?: number;
  }) => {
    const response = await api.post('/videos/init-upload', payload);
    return response.data.data as {
      videoId: string;
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
      s3Key: string;
      bucket: string;
    };
  },

  completeS3Upload: async (payload: {
    videoId: string;
    sizeBytes?: number;
    durationSec?: number;
    success?: boolean;
    errorCode?: string;
    errorMessage?: string;
  }): Promise<S3Video> => {
    const response = await api.post('/videos/complete-upload', payload);
    return response.data.data;
  },

  listS3Videos: async (params: S3VideoQueryParams): Promise<S3VideosResponse> => {
    const cleanedParams: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedParams[key] = value;
      }
    });

    const response = await api.get('/videos/s3', { params: cleanedParams });
    return response.data;
  },

  getS3VideoViewUrl: async (videoId: string) => {
    const response = await api.get(`/videos/${videoId}/view-url`);
    return response.data.data as {
      url: string;
      expiresInSeconds: number;
      video: S3Video;
    };
  },
};
