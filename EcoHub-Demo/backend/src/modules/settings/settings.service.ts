import prisma from '../../config/database';
import { badRequest, conflict, notFound } from '../../middlewares/error.middleware';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { decryptFernet, encryptFernet } from '../../utils/fernet';
import * as captureService from '../capture/capture.service';
import * as captureRuntimeService from '../capture/capture-runtime.service';
import * as rtspRuntimeService from '../capture/rtsp-runtime.service';

type CaptureSourceType = 'usb' | 'rtsp';
type CaptureSensitivity = 'low' | 'normal' | 'high';

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
    employeeCode: string;
    workSessionLabel: string;
  };
}

export interface CaptureCameraStatusSnapshot {
  initialized?: boolean;
  running: boolean;
  error?: string | null;
  last_test?: string | null;
}

export interface CaptureSettingsOverview extends CaptureSettings {
  maxCameras: number;
  availableCameraIndices: number[];
  recordingLocked: boolean;
  cameraStatus: CaptureCameraStatusSnapshot;
  serviceInfo: {
    baseUrl: string;
    mode?: string;
    captureAgentAvailable?: boolean;
    rtspServerAvailable?: boolean;
    preferredRuntime?: 'capture-agent' | 'server-rtsp' | 'server-local';
  };
}

const CAPTURE_MAX_CAMERAS = 2;

const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  cameraConfigs: Array.from({ length: CAPTURE_MAX_CAMERAS }, (_, slotIndex) => ({
    slotIndex,
    enabled: slotIndex === 0,
    sourceType: 'usb',
    cameraIndex: slotIndex,
    rtspUrl: '',
    width: 1280,
    height: 720,
    fps: 20,
  })),
  scanSensitivity: 'normal',
  qrCooldownSeconds: 5,
  recordingCameraSlot: 0,
  employeeSession: {
    employeeName: '',
    employeeCode: '',
    workSessionLabel: '',
  },
};

const resolveFirstExistingPath = async (candidates: string[]) => {
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return candidates[0];
};

const getCaptureConfigFilePath = () => process.env.CAPTURE_CONFIG_FILE || '';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getDefaultAvailableCameraIndices = (settings: CaptureSettings) => {
  const configured = settings.cameraConfigs
    .filter((camera) => camera.sourceType === 'usb')
    .map((camera) => camera.cameraIndex);

  const merged = new Set<number>([0, 1, ...configured.filter((value) => Number.isFinite(value) && value >= 0)]);
  return Array.from(merged).sort((a, b) => a - b);
};

const getAvailableCameraIndices = async (settings: CaptureSettings) => {
  try {
    const result = await captureService.forwardGet('/bridge/available-cameras');
    if (result.ok && result.data && typeof result.data === 'object') {
      const cameras = (result.data as any).available_cameras;
      if (Array.isArray(cameras) && cameras.every((item) => Number.isInteger(item))) {
        return cameras as number[];
      }
    }
  } catch {
    // Fallback below.
  }

  return getDefaultAvailableCameraIndices(settings);
};

const normalizeCaptureSettings = (raw: any): CaptureSettings => {
  const cameraConfigsRaw = Array.isArray(raw?.camera_configs) ? raw.camera_configs : [];

  const normalizedConfigs = Array.from({ length: CAPTURE_MAX_CAMERAS }, (_, slotIndex) => {
    const existing = cameraConfigsRaw.find((item: any, idx: number) => {
      const itemSlot = typeof item?.slot_index === 'number' ? item.slot_index : idx;
      return itemSlot === slotIndex;
    });

    return {
      slotIndex,
      enabled: !!existing,
      sourceType: existing?.source_type === 'rtsp' ? 'rtsp' : 'usb',
      cameraIndex:
        typeof existing?.camera_index === 'number'
          ? existing.camera_index
          : DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex].cameraIndex,
      rtspUrl: typeof existing?.rtsp_url === 'string' ? existing.rtsp_url : '',
      width:
        typeof existing?.width === 'number'
          ? existing.width
          : DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex].width,
      height:
        typeof existing?.height === 'number'
          ? existing.height
          : DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex].height,
      fps:
        typeof existing?.fps === 'number'
          ? existing.fps
          : DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex].fps,
    } satisfies CaptureCameraConfig;
  });

  if (!normalizedConfigs.some((cfg) => cfg.enabled)) {
    normalizedConfigs[0].enabled = true;
  }

  const scanSensitivity = ['low', 'normal', 'high'].includes(raw?.scan_sensitivity)
    ? raw.scan_sensitivity
    : DEFAULT_CAPTURE_SETTINGS.scanSensitivity;

  const qrCooldownSeconds = clamp(
    Number(raw?.qr_cooldown_seconds || DEFAULT_CAPTURE_SETTINGS.qrCooldownSeconds),
    1,
    60
  );

  const recordingCameraSlot = clamp(
    Number(raw?.recording_camera_slot ?? DEFAULT_CAPTURE_SETTINGS.recordingCameraSlot),
    0,
    CAPTURE_MAX_CAMERAS - 1
  );

  const employeeSessionRaw = raw?.employee_session || {};

  return {
    cameraConfigs: normalizedConfigs,
    scanSensitivity,
    qrCooldownSeconds,
    recordingCameraSlot,
    employeeSession: {
      employeeName: typeof employeeSessionRaw.employee_name === 'string' ? employeeSessionRaw.employee_name : '',
      employeeCode: typeof employeeSessionRaw.employee_code === 'string' ? employeeSessionRaw.employee_code : '',
      workSessionLabel:
        typeof employeeSessionRaw.work_session_label === 'string' ? employeeSessionRaw.work_session_label : '',
    },
  };
};

const getConfigPathCandidates = () =>
  [
    getCaptureConfigFilePath(),
    path.resolve(process.cwd(), '..', 'eco_hub_demo', 'config.json'),
    path.resolve(process.cwd(), '..', '..', 'eco_hub_demo', 'config.json'),
  ].filter(Boolean);

export const getCaptureSettings = async (): Promise<CaptureSettings> => {
  const filePath = await resolveFirstExistingPath(getConfigPathCandidates());
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return normalizeCaptureSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_CAPTURE_SETTINGS;
  }
};

const getRuntimeSnapshot = async (settings: CaptureSettings, userId?: string | null) => {
  const captureAgentAvailable = await captureService.isCaptureServiceReachable();
  const hasEnabledRtspCamera = settings.cameraConfigs.some((camera) => camera.enabled && camera.sourceType === 'rtsp');

  let runtimeStatus: any = null;
  let cameraStatus: CaptureCameraStatusSnapshot = { running: false, initialized: false, error: null };

  if (captureAgentAvailable && !hasEnabledRtspCamera) {
    try {
      const runtimeResult = await captureService.forwardGet('/status');
      if (runtimeResult.ok && runtimeResult.data && typeof runtimeResult.data === 'object') {
        runtimeStatus = runtimeResult.data;
      }
    } catch {
      runtimeStatus = null;
    }

    try {
      const cameraResult = await captureService.forwardGet('/camera_status');
      if (cameraResult.ok && cameraResult.data && typeof cameraResult.data === 'object') {
        const raw = cameraResult.data as Record<string, unknown>;
        cameraStatus = {
          initialized: Boolean(raw.initialized),
          running: Boolean(raw.running),
          error: typeof raw.error === 'string' ? raw.error : null,
          last_test: typeof raw.last_test === 'string' ? raw.last_test : null,
        };
      }
    } catch {
      cameraStatus = { running: false, initialized: false, error: null };
    }
  } else if (userId) {
    runtimeStatus = captureRuntimeService.getRuntimeStatus(userId);
    cameraStatus = captureRuntimeService.peekCameraStatus(userId);
  }

  const recordingLocked = Boolean(
    runtimeStatus?.is_recording ||
      runtimeStatus?.isRecording ||
      runtimeStatus?.recording ||
      runtimeStatus?.locked
  );

  return {
    runtimeStatus,
    cameraStatus,
    recordingLocked,
    captureAgentAvailable,
  };
};

export const buildCaptureSettingsOverview = async (userId?: string | null): Promise<CaptureSettingsOverview> => {
  const settings = await getCaptureSettings();
  const { cameraStatus, recordingLocked, captureAgentAvailable } = await getRuntimeSnapshot(settings, userId);
  const availableCameraIndices = await getAvailableCameraIndices(settings);
  const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
  const hasEnabledRtspCamera = settings.cameraConfigs.some((camera) => camera.enabled && camera.sourceType === 'rtsp');

  const preferredRuntime = hasEnabledRtspCamera
    ? rtspServerAvailable
      ? 'server-rtsp'
      : 'server-local'
    : captureAgentAvailable
      ? 'capture-agent'
      : 'server-local';

  return {
    ...settings,
    maxCameras: CAPTURE_MAX_CAMERAS,
    availableCameraIndices,
    recordingLocked,
    cameraStatus,
    serviceInfo: {
      ...captureService.getCaptureServiceInfo(),
      mode: preferredRuntime,
      captureAgentAvailable,
      rtspServerAvailable,
      preferredRuntime,
    },
  };
};

export const updateCaptureSettings = async (payload: Partial<CaptureSettings>, userId?: string | null) => {
  const currentSettings = await getCaptureSettings();
  const runtime = await getRuntimeSnapshot(currentSettings, userId);
  if (runtime.recordingLocked) {
    throw badRequest('Dang quay video, khong the thay doi cau hinh camera');
  }

  const filePath = await resolveFirstExistingPath(getConfigPathCandidates());
  const nextSettings: CaptureSettings = {
    ...currentSettings,
    ...payload,
    cameraConfigs: payload.cameraConfigs || currentSettings.cameraConfigs,
    employeeSession: {
      ...currentSettings.employeeSession,
      ...(payload.employeeSession || {}),
    },
  };

  const enabledCameraConfigs = nextSettings.cameraConfigs.filter((camera) => camera.enabled);
  if (!enabledCameraConfigs.length) {
    throw badRequest('Can bat it nhat 1 camera de luong quet / quay video hoat dong');
  }

  enabledCameraConfigs.forEach((camera) => {
    if (camera.sourceType === 'rtsp') {
      if (!String(camera.rtspUrl || '').trim().toLowerCase().startsWith('rtsp://')) {
        throw badRequest(`Camera ${camera.slotIndex + 1}: RTSP URL phai bat dau bang rtsp://`);
      }
    }

    if (camera.sourceType === 'usb' && (!Number.isInteger(camera.cameraIndex) || camera.cameraIndex < 0)) {
      throw badRequest(`Camera ${camera.slotIndex + 1}: camera index USB khong hop le`);
    }
  });

  if (!enabledCameraConfigs.some((camera) => camera.slotIndex === nextSettings.recordingCameraSlot)) {
    nextSettings.recordingCameraSlot = enabledCameraConfigs[0].slotIndex;
  }

  const normalized = normalizeCaptureSettings({
    camera_configs: nextSettings.cameraConfigs
      .filter((cfg) => cfg.enabled)
      .map((cfg) => ({
        slot_index: cfg.slotIndex,
        source_type: cfg.sourceType,
        camera_index: Number(cfg.cameraIndex || 0),
        rtsp_url: cfg.rtspUrl || '',
        width: Number(cfg.width || 1280),
        height: Number(cfg.height || 720),
        fps: Number(cfg.fps || 20),
      })),
    scan_sensitivity: nextSettings.scanSensitivity,
    qr_cooldown_seconds: nextSettings.qrCooldownSeconds,
    recording_camera_slot: nextSettings.recordingCameraSlot,
    employee_session: {
      employee_name: nextSettings.employeeSession.employeeName || '',
      employee_code: nextSettings.employeeSession.employeeCode || '',
      work_session_label: nextSettings.employeeSession.workSessionLabel || '',
    },
  });

  const configToPersist = {
    camera_configs: normalized.cameraConfigs
      .filter((cfg) => cfg.enabled)
      .map((cfg) => ({
        slot_index: cfg.slotIndex,
        source_type: cfg.sourceType,
        camera_index: cfg.cameraIndex,
        rtsp_url: cfg.rtspUrl,
        width: cfg.width,
        height: cfg.height,
        fps: cfg.fps,
      })),
    scan_sensitivity: normalized.scanSensitivity,
    auto_record_on_qr: true,
    storage_mode: 'local',
    qr_cooldown_seconds: normalized.qrCooldownSeconds,
    recording_camera_slot: normalized.recordingCameraSlot,
    employee_session: {
      employee_name: normalized.employeeSession.employeeName,
      employee_code: normalized.employeeSession.employeeCode,
      work_session_label: normalized.employeeSession.workSessionLabel,
    },
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  let existingConfig: any = {};
  try {
    existingConfig = JSON.parse(await fs.readFile(filePath, 'utf-8'));
  } catch {
    existingConfig = {};
  }

  await fs.writeFile(filePath, JSON.stringify({ ...existingConfig, ...configToPersist }, null, 2), 'utf-8');
  return normalized;
};

export const getReportSubscriptions = async (shopId: string | null) => {
  if (!shopId) return [];
  const shopExists = await prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
  if (!shopExists) return [];
  return prisma.reportSubscription.findMany({
    where: { shopId },
    orderBy: { createdAt: 'desc' },
  });
};

export const createReportSubscription = async (
  data: {
    email: string;
    reportType: 'financial' | 'operational' | 'both';
    enabled?: boolean;
    shopId?: string;
  },
  shopIdFromContext: string | null
) => {
  const shopId = data.shopId || shopIdFromContext;
  if (!shopId) {
    throw badRequest('Vui long chon shop hoac vao ngu canh shop truoc khi them email nhan bao cao');
  }

  const existing = await prisma.reportSubscription.findFirst({
    where: {
      shopId,
      email: data.email,
      reportType: data.reportType,
    },
  });

  if (existing) {
    throw conflict('Email nay da dang ky nhan loai bao cao nay trong shop');
  }

  return prisma.reportSubscription.create({
    data: {
      shopId,
      email: data.email,
      reportType: data.reportType,
      enabled: data.enabled !== undefined ? data.enabled : true,
    },
  });
};

export const updateReportSubscription = async (
  id: string,
  data: {
    enabled?: boolean;
    reportType?: 'financial' | 'operational' | 'both';
  },
  shopId: string | null
) => {
  const subscription = await prisma.reportSubscription.findUnique({ where: { id } });

  if (!subscription) {
    throw notFound('Khong tim thay cau hinh email');
  }
  if (shopId && subscription.shopId !== shopId) {
    throw notFound('Chi duoc sua cau hinh thuoc shop hien tai');
  }

  return prisma.reportSubscription.update({
    where: { id },
    data,
  });
};

export const deleteReportSubscription = async (id: string, shopId: string | null) => {
  const subscription = await prisma.reportSubscription.findUnique({ where: { id } });

  if (!subscription) {
    throw notFound('Khong tim thay cau hinh email');
  }
  if (shopId && subscription.shopId !== shopId) {
    throw notFound('Chi duoc xoa cau hinh thuoc shop hien tai');
  }

  await prisma.reportSubscription.delete({
    where: { id },
  });
};

export const getS3Settings = async () => {
  const filePath = await resolveFirstExistingPath(getConfigPathCandidates());
  const keyFilePath = path.join(path.dirname(filePath), 'config.key');
  
  let key = '';
  try {
    key = await fs.readFile(keyFilePath, 'utf8');
    key = key.trim();
  } catch {
    const randomKey = crypto.randomBytes(32).toString('base64url');
    await fs.writeFile(keyFilePath, randomKey, 'utf8');
    key = randomKey;
  }

  let configData: any = {};
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    configData = JSON.parse(raw);
  } catch {
    configData = {};
  }

  const s3Data = configData.s3_config || {};
  const decryptedAccessKey = s3Data.access_key ? decryptFernet(s3Data.access_key, key) : '';
  const decryptedSecretKey = s3Data.secret_key ? decryptFernet(s3Data.secret_key, key) : '';

  return {
    endpoint: s3Data.endpoint || '',
    accessKey: decryptedAccessKey,
    secretKey: decryptedSecretKey,
    bucket: s3Data.bucket || '',
    region: s3Data.region || 'hn-2',
    prefix: s3Data.prefix || '',
  };
};

export const updateS3Settings = async (payload: {
  endpoint: string;
  accessKey?: string;
  secretKey?: string;
  bucket: string;
  region?: string;
  prefix?: string;
}) => {
  const filePath = await resolveFirstExistingPath(getConfigPathCandidates());
  const keyFilePath = path.join(path.dirname(filePath), 'config.key');
  
  let key = '';
  try {
    key = await fs.readFile(keyFilePath, 'utf8');
    key = key.trim();
  } catch {
    const randomKey = crypto.randomBytes(32).toString('base64url');
    await fs.writeFile(keyFilePath, randomKey, 'utf8');
    key = randomKey;
  }

  let configData: any = {};
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    configData = JSON.parse(raw);
  } catch {
    configData = {};
  }

  const existingS3 = configData.s3_config || {};
  
  const finalAccessKey = payload.accessKey !== undefined ? payload.accessKey : (existingS3.access_key ? decryptFernet(existingS3.access_key, key) : '');
  const finalSecretKey = payload.secretKey !== undefined ? payload.secretKey : (existingS3.secret_key ? decryptFernet(existingS3.secret_key, key) : '');

  const encryptedAccessKey = encryptFernet(finalAccessKey, key);
  const encryptedSecretKey = encryptFernet(finalSecretKey, key);

  configData.s3_config = {
    endpoint: payload.endpoint,
    access_key: encryptedAccessKey,
    secret_key: encryptedSecretKey,
    bucket: payload.bucket,
    region: payload.region || 'hn-2',
    prefix: payload.prefix || '',
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(configData, null, 2), 'utf-8');

  return {
    endpoint: payload.endpoint,
    accessKey: finalAccessKey,
    secretKey: finalSecretKey,
    bucket: payload.bucket,
    region: payload.region || 'hn-2',
    prefix: payload.prefix || '',
  };
};
