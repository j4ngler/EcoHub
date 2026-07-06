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

export type CaptureSourceType = 'usb' | 'rtsp';
export type CaptureSensitivity = 'low' | 'normal' | 'high';

export interface CaptureCameraConfig {
  slotIndex: number;
  enabled: boolean;
  sourceType: CaptureSourceType;
  cameraIndex: number;
  rtspUrl: string;
  width: number;
  height: number;
  fps: number;
}

export interface CaptureSettings {
  cameraConfigs: CaptureCameraConfig[];
  scanSensitivity: CaptureSensitivity;
  qrCooldownSeconds: number;
  recordingCameraSlot: number;
  employeeSession: {
    employeeName: string;
    workSessionLabel: string;
  };
}

export interface CaptureSettingsOverview extends CaptureSettings {
  maxCameras: number;
  availableCameraIndices: number[];
  recordingLocked: boolean;
  cameraStatus: {
    initialized?: boolean;
    running: boolean;
    error?: string | null;
    last_test?: string | null;
  };
  serviceInfo: {
    baseUrl: string;
    mode?: string;
    captureAgentAvailable?: boolean;
    rtspServerAvailable?: boolean;
    preferredRuntime?: 'capture-agent' | 'server-rtsp' | 'server-local';
  };
}

export const settingsApi = {
  getCaptureSettings: async (): Promise<CaptureSettingsOverview> => {
    const response = await api.get('/settings/capture');
    return response.data.data;
  },

  updateCaptureSettings: async (data: Partial<CaptureSettings>): Promise<CaptureSettingsOverview> => {
    const response = await api.put('/settings/capture', data);
    return response.data.data;
  },

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

  getS3Settings: async (): Promise<S3Settings> => {
    const response = await api.get('/settings/s3');
    return response.data.data;
  },

  updateS3Settings: async (data: Partial<S3Settings>): Promise<S3Settings> => {
    const response = await api.put('/settings/s3', data);
    return response.data.data;
  },

  getS3Capacity: async (): Promise<S3Capacity> => {
    const response = await api.get('/settings/s3/capacity');
    return response.data.data;
  },
};

export interface S3Settings {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  prefix: string;
}

export interface S3CapacityModule {
  sizeBytes: number;
  count: number;
}

export interface S3Capacity {
  totalSizeBytes: number;
  totalCount: number;
  modules: {
    packaging: S3CapacityModule;
    receiving: S3CapacityModule;
    shipper: S3CapacityModule;
  };
}
