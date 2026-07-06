import { CaptureRuntimeStatus, CaptureTestCameraResponse } from './capture.api';

const DEFAULT_LOCAL_AGENT_URL = 'http://127.0.0.1:5000';

const getBaseUrl = () => {
  const configured = import.meta.env.VITE_LOCAL_CAPTURE_AGENT_URL as string | undefined;
  return (configured || DEFAULT_LOCAL_AGENT_URL).replace(/\/+$/, '');
};

const parseResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json, text/plain;q=0.9, */*;q=0.8',
      'Content-Type': 'application/json',
      'X-EcoHub-Local-Agent': '1',
      ...(options?.headers || {}),
    },
  });
  const data = await parseResponse(response);

  if (!response.ok) {
    const message =
      typeof data === 'object' && data
        ? (data as any).message || (data as any).error || (data as any).detail
        : String(data || '');
    throw new Error(message || `Local capture agent HTTP ${response.status}`);
  }

  return data as T;
};

const post = <T>(path: string, body?: Record<string, unknown>) =>
  request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });

export const localCaptureAgentApi = {
  baseUrl: getBaseUrl,

  getStatus: async () => {
    return request<CaptureRuntimeStatus & { running?: boolean; ok?: boolean }>('/status');
  },

  testCamera: async () => {
    return post<CaptureTestCameraResponse>('/test_camera');
  },

  startCameras: async () => {
    return post('/start_cameras');
  },

  stopCameras: async () => {
    return post('/stop_cameras');
  },

  setRecordingFlow: async (recordingFlow: 'outbound' | 'return') => {
    return post('/api/recording_flow', { recording_flow: recordingFlow });
  },

  setCurrentOrder: async (payload: {
    orderCode: string;
    orderInfo?: Record<string, unknown> | null;
    recordingFlow?: 'outbound' | 'return';
    ecohubUpload?: {
      endpoint: string;
      accessToken: string;
      orderId: string;
      trackingCode: string;
    };
  }) => {
    return post('/api/current_order', {
      order_code: payload.orderCode,
      order_info: payload.orderInfo || null,
      recording_flow: payload.recordingFlow || 'outbound',
      ecohub_upload: payload.ecohubUpload || null,
    });
  },

  startRecording: async () => {
    return post('/start_recording');
  },

  stopRecording: async () => {
    return post('/stop_recording');
  },

  resetOrder: async () => {
    return post('/reset_order');
  },
};
