import api from './axios';

export interface CaptureUploadSession {
  sessionId: string;
  userId: string;
  shopId: string | null;
  orderId: string;
  orderCode: string;
  trackingCode: string;
  customerName: string;
  module: 'packaging' | 'receiving';
  recordingFlow: 'outbound' | 'return';
  uploadEndpoint: string;
  createdAt: string;
  expiresAt: string;
}

export interface CapturePrepareResponse {
  session: CaptureUploadSession;
  captureSettings: {
    recordingCameraSlot: number;
    qrCooldownSeconds: number;
    scanSensitivity: 'low' | 'normal' | 'high';
  };
  uploadPolicy: {
    maxFileSizeBytes: number;
    acceptedVideoMimeTypes: string[];
    compressionTargetMb: number;
  };
  order: {
    id: string;
    orderCode: string;
    trackingCode: string;
    status: string;
    customerName: string;
    shop: {
      id: string;
      name: string;
      code: string;
    };
  };
}

export interface CaptureUploadFlowResponse extends CapturePrepareResponse {
  auth: {
    userId: string;
    shopId: string | null;
    roles: string[];
  };
  storage: unknown;
  runtime: CaptureRuntimeStatus;
  serviceInfo: CaptureServiceInfo;
  runtimeSync: {
    flowOk: boolean;
    orderOk: boolean;
  };
  captureAgentAvailable: boolean;
}

export interface CaptureRuntimeStatus {
  is_recording: boolean;
  recording_seconds: number;
  current_order_code?: string | null;
  order_info?: {
    order_id?: string;
    order_code?: string;
    channel_order_id?: string | null;
    tracking_code?: string;
    platform?: string;
    shipping_status?: string;
    shop_id?: string;
    product_id?: string;
    sku_id?: string;
    items?: Array<{ qty?: number; name?: string; product_id?: string; sku_id?: string }>;
  } | null;
  is_paused?: boolean;
  total_items?: number;
  num_cameras?: number;
  packing_state?: {
    items?: Array<{
      key?: string;
      name?: string;
      sku?: string;
      required_qty?: number;
      scanned_count?: number;
      status?: 'ok' | 'missing' | 'excess';
    }>;
    has_missing?: boolean;
    has_excess?: boolean;
  } | null;
  notifications?: Array<{ level?: string; message?: string }>;
  recording_flow?: 'outbound' | 'return';
  recording_flow_label?: string;
  scanned_codes?: string[];
  total_scanned_count?: number;
}

export interface CaptureTestCameraResponse {
  success: boolean;
  message?: string;
  error?: string;
  source_type?: 'usb' | 'rtsp';
  recording_camera_slot?: number;
  config?: Record<string, unknown>;
}

export interface CaptureServiceInfo {
  baseUrl: string;
  mode?: string;
  captureAgentAvailable?: boolean;
  rtspServerAvailable?: boolean;
  cameraMode?: 'usb' | 'rtsp';
  serverHandlesCamera?: boolean;
  capabilities?: {
    nativeApiManagement?: boolean;
    nativeStorageUsage?: boolean;
    nativeCaptureRuntimeState?: boolean;
    requiresCaptureAgentForCamera?: boolean;
    requiresCaptureAgentForRecording?: boolean;
  };
}

export const captureApi = {
  getServiceInfo: async () => {
    const response = await api.get('/capture/service-info');
    return response.data.data as CaptureServiceInfo;
  },

  getHealth: async () => {
    const response = await api.get('/capture/health');
    return response.data.data;
  },

  getRuntimeStatus: async (): Promise<CaptureRuntimeStatus> => {
    const response = await api.get('/capture/runtime-status');
    return response.data.data;
  },

  getCameraStatus: async () => {
    const response = await api.get('/capture/camera-status');
    return response.data.data;
  },

  getUploadStatus: async () => {
    const response = await api.get('/capture/upload-status');
    return response.data.data as {
      queue: Array<{
        id: string;
        tracking_code: string;
        status: string;
        error?: string | null;
        module?: string;
        created_at: string;
        updated_at: string;
        file_name?: string;
      }>;
      total: number;
      processing: boolean;
      source: string;
    };
  },

  getVideoStorageUsage: async () => {
    const response = await api.get('/capture/video-storage-usage');
    return response.data.data;
  },

  getRecordingFlow: async () => {
    const response = await api.get('/capture/recording-flow');
    return response.data.data as {
      ok: boolean;
      recording_flow: 'outbound' | 'return';
      label: string;
      locked?: boolean;
    };
  },

  setRecordingFlow: async (recordingFlow: 'outbound' | 'return') => {
    const response = await api.post('/capture/recording-flow', { recording_flow: recordingFlow });
    return response.data.data as {
      ok: boolean;
      recording_flow: 'outbound' | 'return';
      label: string;
      locked?: boolean;
    };
  },

  getActiveSession: async (): Promise<{ session: CaptureUploadSession } | null> => {
    const response = await api.get('/capture/active-session');
    return response.data.data;
  },

  prepareUpload: async (payload: {
    orderId: string;
    trackingCode?: string;
    module?: 'packaging' | 'receiving';
    recordingFlow?: 'outbound' | 'return';
  }): Promise<CapturePrepareResponse> => {
    const response = await api.post('/capture/prepare-upload', payload);
    return response.data.data;
  },

  prepareUploadFlow: async (payload: {
    orderId: string;
    trackingCode?: string;
    module?: 'packaging' | 'receiving';
    recordingFlow?: 'outbound' | 'return';
  }): Promise<CaptureUploadFlowResponse> => {
    const response = await api.post('/capture/prepare-upload-flow', payload);
    return response.data.data;
  },

  startCameras: async () => {
    const response = await api.post('/capture/start-cameras', {});
    return response.data.data;
  },

  testCamera: async (): Promise<CaptureTestCameraResponse> => {
    const response = await api.post('/capture/test-camera', {});
    return response.data.data;
  },

  stopCameras: async () => {
    const response = await api.post('/capture/stop-cameras', {});
    return response.data.data;
  },

  startRecording: async (payload?: { mode?: 'browser' }) => {
    const response = await api.post('/capture/start-recording', payload || {});
    return response.data.data;
  },

  stopRecording: async (payload?: { mode?: 'browser' }) => {
    const response = await api.post('/capture/stop-recording', payload || {});
    return response.data.data;
  },

  pauseRecording: async () => {
    const response = await api.post('/capture/pause-recording', {});
    return response.data.data;
  },

  resumeRecording: async () => {
    const response = await api.post('/capture/resume-recording', {});
    return response.data.data;
  },

  cancelRecording: async () => {
    const response = await api.post('/capture/cancel-recording', {});
    return response.data.data;
  },

  getRtspPreviewUrl: (accessToken: string) => {
    const base = `${window.location.origin}/api`.replace(/\/+$/, '');
    return `${base}/capture/rtsp-preview?access_token=${encodeURIComponent(accessToken)}`;
  },

  resetOrder: async () => {
    const response = await api.post('/capture/reset-order', {});
    return response.data.data;
  },

  manualScan: async (code: string) => {
    const response = await api.post('/capture/manual-scan', { code });
    return response.data.data;
  },

  manualOrder: async (orderCode: string) => {
    const response = await api.post('/capture/manual-order', { orderCode });
    return response.data.data;
  },

  clearActiveSession: async () => {
    const response = await api.delete('/capture/active-session');
    return response.data.data;
  },
};
