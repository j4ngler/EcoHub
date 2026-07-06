import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { RoleName } from '@prisma/client';
import { badRequest } from '../../middlewares/error.middleware';
import * as rtspRuntimeService from './rtsp-runtime.service';
import * as captureRuntimeService from './capture-runtime.service';
import * as captureSessionService from './capture-session.service';
import * as uploadQueueService from './upload-queue.service';
import { compressVideoFile } from '../videos/video-processing.service';

type CurrentUser = {
  userId: string;
  roles: RoleName[];
  shopId?: string | null;
};

type RtspRecordingState = {
  userId: string;
  process: ChildProcess | null;
  parts: string[];
  startedAt: number;
  sessionId: string;
  trackingCode: string;
  orderId: string;
  module: 'packaging' | 'receiving';
  paused: boolean;
  sequence: number;
};

const recordingByUser = new Map<string, RtspRecordingState>();

const getFfmpegPath = () => process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

const waitForClose = async (child: ChildProcess, timeoutMs: number) => {
  return new Promise<number | null>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve(null);
    }, timeoutMs);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    });
  });
};

const stopProcessGracefully = async (child: ChildProcess | null) => {
  if (!child) return;
  try {
    child.stdin?.write('q');
    child.stdin?.end();
  } catch {
    child.kill('SIGTERM');
  }
  await waitForClose(child, 8000);
};

const buildPartPath = (trackingCode: string, sequence: number) => {
  const recordingDir = path.resolve(process.cwd(), 'uploads', 'rtsp-recordings');
  const safeName = `${trackingCode}-${Date.now()}-part-${sequence}.mp4`.replace(/[^\w.-]+/g, '_');
  return path.join(recordingDir, safeName);
};

const spawnRecordingPart = async (state: RtspRecordingState) => {
  const camera = await rtspRuntimeService.getRecordingCameraConfig();
  if (camera.sourceType !== 'rtsp' || !camera.rtspUrl.trim()) {
    throw badRequest('Camera RTSP khong hop le de tiep tuc ghi hinh');
  }

  await fs.mkdir(path.resolve(process.cwd(), 'uploads', 'rtsp-recordings'), { recursive: true });
  const outputPath = buildPartPath(state.trackingCode, state.sequence++);

  const child = spawn(
    getFfmpegPath(),
    ['-rtsp_transport', 'tcp', '-y', '-i', camera.rtspUrl, '-an', '-c:v', 'copy', outputPath],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    }
  );

  child.on('error', (error) => {
    captureRuntimeService.markCameraRunning(state.userId, false, error.message);
  });

  state.process = child;
  state.parts.push(outputPath);
  state.paused = false;
  return outputPath;
};

const concatParts = async (parts: string[], trackingCode: string) => {
  const finalPath = path.join(
    path.resolve(process.cwd(), 'uploads', 'rtsp-recordings'),
    `${trackingCode}-${Date.now()}-rtsp-final.mp4`.replace(/[^\w.-]+/g, '_')
  );
  if (parts.length === 1) {
    await fs.copyFile(parts[0], finalPath);
    return finalPath;
  }

  const listFile = path.join(os.tmpdir(), `ecohub-rtsp-concat-${Date.now()}.txt`);
  const content = parts.map((item) => `file '${item.replace(/'/g, "'\\''")}'`).join(os.EOL);
  await fs.writeFile(listFile, content, 'utf-8');

  const child = spawn(
    getFfmpegPath(),
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', finalPath],
    { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] }
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const code = await waitForClose(child, 15000);
  await fs.unlink(listFile).catch(() => undefined);

  if (code !== 0) {
    throw badRequest(stderr || 'Khong noi duoc cac segment RTSP');
  }

  return finalPath;
};

export const startRtspRecording = async (currentUser: CurrentUser) => {
  if (recordingByUser.has(currentUser.userId)) {
    throw badRequest('Dang co phien ghi hinh RTSP chua ket thuc');
  }

  const camera = await rtspRuntimeService.getRecordingCameraConfig();
  if (camera.sourceType !== 'rtsp') {
    throw badRequest('Camera dang chon khong phai RTSP');
  }
  if (!camera.rtspUrl.trim()) {
    throw badRequest('RTSP URL dang de trong');
  }

  const info = await rtspRuntimeService.getRtspServiceInfo();
  if (!info.ffmpegAvailable) {
    throw badRequest(`Server chua co ffmpeg de ghi hinh RTSP. Kiem tra ${info.ffmpegPath}.`);
  }

  const session = await captureSessionService.ensureActiveRecordingSession(currentUser, 'packaging');
  const state: RtspRecordingState = {
    userId: currentUser.userId,
    process: null,
    parts: [],
    startedAt: Date.now(),
    sessionId: session.sessionId,
    trackingCode: session.trackingCode,
    orderId: session.orderId,
    module: session.module,
    paused: false,
    sequence: 1,
  };

  await spawnRecordingPart(state);
  recordingByUser.set(currentUser.userId, state);
  captureRuntimeService.markCameraRunning(currentUser.userId, true, null);
  captureRuntimeService.markRecordingStarted(currentUser.userId);

  return {
    ok: true,
    mode: 'server-rtsp-recording',
    parts: state.parts.length,
    startedAt: new Date().toISOString(),
  };
};

export const pauseRtspRecording = async (currentUser: CurrentUser) => {
  const active = recordingByUser.get(currentUser.userId);
  if (!active || !active.process) {
    throw badRequest('Khong co phien ghi hinh RTSP dang chay');
  }

  await stopProcessGracefully(active.process);
  active.process = null;
  active.paused = true;
  captureRuntimeService.markRecordingPaused(currentUser.userId);

  return {
    ok: true,
    mode: 'server-rtsp-recording',
    paused: true,
    parts: active.parts.length,
  };
};

export const resumeRtspRecording = async (currentUser: CurrentUser) => {
  const active = recordingByUser.get(currentUser.userId);
  if (!active) {
    throw badRequest('Khong co phien RTSP de tiep tuc');
  }
  if (!active.paused) {
    throw badRequest('Phien RTSP hien khong o trang thai tam dung');
  }

  await spawnRecordingPart(active);
  captureRuntimeService.markRecordingResumed(currentUser.userId);

  return {
    ok: true,
    mode: 'server-rtsp-recording',
    paused: false,
    parts: active.parts.length,
  };
};

export const cancelRtspRecording = async (currentUser: CurrentUser) => {
  const active = recordingByUser.get(currentUser.userId);
  if (!active) {
    throw badRequest('Khong co phien RTSP de huy');
  }

  recordingByUser.delete(currentUser.userId);
  await stopProcessGracefully(active.process);
  await Promise.all(active.parts.map((part) => fs.unlink(part).catch(() => undefined)));

  captureRuntimeService.markRecordingStopped(currentUser.userId);
  captureSessionService.clearActiveUploadSession(currentUser);

  return {
    ok: true,
    mode: 'server-rtsp-recording',
    cancelled: true,
  };
};

export const stopRtspRecording = async (currentUser: CurrentUser) => {
  const active = recordingByUser.get(currentUser.userId);
  if (!active) {
    throw badRequest('Khong co phien ghi hinh RTSP dang chay');
  }

  recordingByUser.delete(currentUser.userId);
  await stopProcessGracefully(active.process);
  captureRuntimeService.markRecordingStopped(currentUser.userId);

  if (!active.parts.length) {
    throw badRequest('Phien RTSP khong tao duoc segment nao');
  }

  const finalPath = await concatParts(active.parts, active.trackingCode);
  await Promise.all(active.parts.map((part) => fs.unlink(part).catch(() => undefined)));

  const compressed = await compressVideoFile(finalPath, {
    maxWidth: 854,
    targetFps: 7,
  });

  let uploadPath = finalPath;
  if (compressed.compressed && compressed.outputPath !== finalPath) {
    await fs.unlink(finalPath).catch(() => undefined);
    uploadPath = compressed.outputPath;
  }

  const job = await uploadQueueService.enqueueUpload({
    userId: currentUser.userId,
    orderId: active.orderId,
    trackingCode: active.trackingCode,
    module: active.module,
    filePath: uploadPath,
    originalName: path.basename(uploadPath),
  });

  captureSessionService.clearActiveUploadSession(currentUser);

  return {
    ok: true,
    mode: 'server-rtsp-recording',
    queued: true,
    queueJobId: job.id,
  };
};

export const isRtspRecordingActive = (userId: string) => {
  return recordingByUser.has(userId);
};
