import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { env } from '../../config/environment';
import { badRequest } from '../../middlewares/error.middleware';
import * as captureRuntimeService from './capture-runtime.service';

type RtspCameraConfig = {
  slotIndex: number;
  enabled: boolean;
  sourceType: 'usb' | 'rtsp';
  cameraIndex: number;
  rtspUrl: string;
  width: number;
  height: number;
  fps: number;
};

type RtspSettings = {
  cameraConfigs: RtspCameraConfig[];
  recordingCameraSlot: number;
};

type RtspWorkerState = {
  cameraSlot: number;
  rtspUrl: string;
  startedAt: number;
};

const DEFAULT_FFPROBE = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
const DEFAULT_FFMPEG = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
const workerStateByUser = new Map<string, RtspWorkerState>();

const configCandidates = () =>
  [
    env.CAPTURE_CONFIG_FILE,
    path.resolve(process.cwd(), '..', 'eco_hub_demo', 'config.json'),
    path.resolve(process.cwd(), '..', '..', 'eco_hub_demo', 'config.json'),
  ].filter(Boolean) as string[];

const resolveConfigPath = async () => {
  for (const candidate of configCandidates()) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return configCandidates()[0];
};

const readSettings = async (): Promise<RtspSettings> => {
  const filePath = await resolveConfigPath();
  const raw = await fs.readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw);
  const cameraConfigsRaw = Array.isArray(parsed?.camera_configs) ? parsed.camera_configs : [];

  return {
    cameraConfigs: Array.from({ length: 2 }, (_, slotIndex) => {
      const config = cameraConfigsRaw.find((item: any, index: number) => {
        const itemSlot = typeof item?.slot_index === 'number' ? item.slot_index : index;
        return itemSlot === slotIndex;
      });

      return {
        slotIndex,
        enabled: Boolean(config),
        sourceType: config?.source_type === 'rtsp' ? 'rtsp' : 'usb',
        cameraIndex: Number(config?.camera_index ?? slotIndex),
        rtspUrl: String(config?.rtsp_url || ''),
        width: Number(config?.width ?? 1280),
        height: Number(config?.height ?? 720),
        fps: Number(config?.fps ?? 20),
      };
    }),
    recordingCameraSlot: Number(parsed?.recording_camera_slot ?? 0),
  };
};

const getRecordingCamera = async () => {
  const settings = await readSettings();
  const preferred =
    settings.cameraConfigs.find((camera) => camera.slotIndex === settings.recordingCameraSlot && camera.enabled) ||
    settings.cameraConfigs.find((camera) => camera.enabled);

  if (!preferred) {
    throw badRequest('Chua co camera nao duoc bat trong cau hinh');
  }

  return preferred;
};

export const getRecordingCameraConfig = async () => {
  return getRecordingCamera();
};

const runBinary = async (
  executable: string,
  args: string[],
  timeoutMs: number
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number | null }> => {
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve({ ok: false, stdout, stderr: `${stderr}\nProcess timeout after ${timeoutMs}ms`.trim(), code: null });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: `${stderr}\n${String(error.message || error)}`.trim(), code: null });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout, stderr, code });
    });
  });
};

const getFfprobePath = () => process.env.FFPROBE_PATH || DEFAULT_FFPROBE;
const getFfmpegPath = () => process.env.FFMPEG_PATH || DEFAULT_FFMPEG;

export const getRtspServiceInfo = async () => {
  const probe = await runBinary(getFfprobePath(), ['-version'], 4000);
  const ffmpeg = await runBinary(getFfmpegPath(), ['-version'], 4000);

  return {
    ffprobeAvailable: probe.ok,
    ffmpegAvailable: ffmpeg.ok,
    ffprobePath: getFfprobePath(),
    ffmpegPath: getFfmpegPath(),
  };
};

export const canHandleServerSideRtsp = async () => {
  const info = await getRtspServiceInfo();
  return info.ffprobeAvailable;
};

export const getCameraMode = async () => {
  const camera = await getRecordingCamera();
  return camera.sourceType;
};

export const testRtspCamera = async (userId: string) => {
  const camera = await getRecordingCamera();
  if (camera.sourceType !== 'rtsp') {
    throw badRequest('Camera dang chon khong phai RTSP. Camera USB khong the duoc test truc tiep boi web server.');
  }
  if (!camera.rtspUrl.trim()) {
    throw badRequest('RTSP URL dang de trong');
  }

  const info = await getRtspServiceInfo();
  if (!info.ffprobeAvailable) {
    throw badRequest(`Server chua co ffprobe/ffmpeg de test RTSP. Kiem tra ${info.ffprobePath}.`);
  }

  const result = await runBinary(
    info.ffprobePath,
    [
      '-v',
      'error',
      '-rtsp_transport',
      'tcp',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height',
      '-of',
      'json',
      camera.rtspUrl,
    ],
    12000
  );

  captureRuntimeService.markCameraTest(userId, result.ok, result.ok ? null : result.stderr || 'RTSP test that bai');

  if (!result.ok) {
    return {
      success: false,
      error: result.stderr || 'RTSP test that bai',
      source_type: 'rtsp' as const,
      recording_camera_slot: camera.slotIndex,
    };
  }

  return {
    success: true,
    message: `RTSP stream hop le o camera ${camera.slotIndex + 1}`,
    source_type: 'rtsp' as const,
    recording_camera_slot: camera.slotIndex,
    config: {
      width: camera.width,
      height: camera.height,
      fps: camera.fps,
    },
    probe: result.stdout,
  };
};

export const startRtspCamera = async (userId: string) => {
  const camera = await getRecordingCamera();
  if (camera.sourceType !== 'rtsp') {
    throw badRequest('Camera dang chon khong phai RTSP. Camera USB khong the duoc khoi dong truc tiep boi web server.');
  }

  const test = await testRtspCamera(userId);
  if (!test.success) {
    throw badRequest(test.error || 'Khong the mo RTSP stream');
  }

  workerStateByUser.set(userId, {
    cameraSlot: camera.slotIndex,
    rtspUrl: camera.rtspUrl,
    startedAt: Date.now(),
  });
  captureRuntimeService.markCameraRunning(userId, true, null);

  return {
    ok: true,
    mode: 'server-rtsp',
    cameraSlot: camera.slotIndex,
    startedAt: new Date().toISOString(),
  };
};

export const stopRtspCamera = async (userId: string) => {
  workerStateByUser.delete(userId);
  captureRuntimeService.markCameraRunning(userId, false, null);
  return {
    ok: true,
    mode: 'server-rtsp',
    stoppedAt: new Date().toISOString(),
  };
};

export const getRtspRuntimeState = (userId: string) => {
  return workerStateByUser.get(userId) || null;
};
