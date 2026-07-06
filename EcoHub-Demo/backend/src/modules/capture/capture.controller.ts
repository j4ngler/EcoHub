import { NextFunction, Response } from 'express';
import { badRequest } from '../../middlewares/error.middleware';
import { success } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { spawn } from 'child_process';
import * as captureService from './capture.service';
import * as captureSessionService from './capture-session.service';
import * as captureRuntimeService from './capture-runtime.service';
import * as rtspRuntimeService from './rtsp-runtime.service';
import * as rtspRecordingService from './rtsp-recording.service';
import * as uploadQueueService from './upload-queue.service';

const relay = async (
  promise: Promise<{ ok: boolean; status: number; data: unknown }>,
  res: Response,
  fallbackMessage: string
) => {
  const result = await promise;
  if (result.ok) {
    return success(res, result.data);
  }

  // Do not leak capture-agent auth failures as backend auth failures.
  // The frontend treats 401 as expired backend auth and redirects to login.
  const status = result.status === 401 || result.status === 403 ? 502 : result.status;

  return res.status(status).json({
    success: false,
    message: fallbackMessage,
    data: result.data,
  });
};

const syncSessionToAgent = async (session: captureSessionService.CaptureUploadSession) => {
  const flowResult = await captureService.forwardPost('/api/recording_flow', {
    recording_flow: session.recordingFlow,
  });

  const orderResult = await captureService.forwardFormPost(
    '/manual-order',
    { order_code: session.trackingCode || session.orderCode },
    { 'X-Requested-With': 'XMLHttpRequest' }
  );

  return { flowResult, orderResult };
};

const legacyAgentOwnsScan = () => {
  return String(process.env.CAPTURE_AGENT_OWNS_SCAN || '').toLowerCase() === 'true';
};

const requireCaptureAgent = async () => {
  const available = await captureService.isCaptureServiceReachable();
  if (!available) {
    throw badRequest(
      'Chuc nang nay can local runtime cho camera USB. Neu muon web server chay doc lap, hay chuyen nguon camera sang RTSP.'
    );
  }
};

const shouldUseServerRtspRuntime = async () => {
  const cameraMode = await rtspRuntimeService.getCameraMode();
  if (cameraMode !== 'rtsp') return false;
  return rtspRuntimeService.canHandleServerSideRtsp();
};

const getFfmpegPath = () => process.env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

const serviceInfoPayload = async () => {
  const captureAgentAvailable = await captureService.isCaptureServiceReachable();
  const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
  const cameraMode = await rtspRuntimeService.getCameraMode();

  return {
    ...captureService.getCaptureServiceInfo(),
    ...captureRuntimeService.getServiceInfo(),
    captureAgentAvailable,
    rtspServerAvailable,
    cameraMode,
    serverHandlesCamera: cameraMode === 'rtsp' && rtspServerAvailable,
  };
};

export const health = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await captureService.isCaptureServiceReachable();
    success(res, {
      available,
      ...captureService.getCaptureServiceInfo(),
      ...captureRuntimeService.getServiceInfo(),
    });
  } catch (error) {
    next(error);
  }
};

export const serviceInfo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await serviceInfoPayload());
  } catch (error) {
    next(error);
  }
};

export const runtimeStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await captureService.isCaptureServiceReachable();
    const useServerRtsp = await shouldUseServerRtspRuntime();
    if (available && !useServerRtsp) {
      await relay(captureService.forwardGet('/status'), res, 'Khong lay duoc trang thai runtime');
      return;
    }

    success(res, captureRuntimeService.getRuntimeStatus(req.user!.userId));
  } catch (error) {
    next(error);
  }
};

export const cameraStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await captureService.isCaptureServiceReachable();
    const useServerRtsp = await shouldUseServerRtspRuntime();
    if (available && !useServerRtsp) {
      await relay(captureService.forwardGet('/camera_status'), res, 'Khong lay duoc trang thai camera');
      return;
    }

    success(res, captureRuntimeService.getCameraStatus(req.user!.userId));
  } catch (error) {
    next(error);
  }
};

export const uploadStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await captureService.isCaptureServiceReachable();
    const useServerRtsp = await shouldUseServerRtspRuntime();
    if (available && !useServerRtsp) {
      await relay(captureService.forwardGet('/upload-status'), res, 'Khong lay duoc trang thai upload');
      return;
    }

    success(res, captureRuntimeService.getUploadStatus());
  } catch (error) {
    next(error);
  }
};

export const videoStorageUsage = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data = await captureRuntimeService.getVideoStorageUsage(req.user?.shopId ?? null);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const prepareUpload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await captureSessionService.prepareUploadSession(req.body, req.user!);
    const available = await captureService.isCaptureServiceReachable();

    let runtimeSync = { flowOk: false, orderOk: false };
    if (available) {
      const synced = await syncSessionToAgent(result.session);
      runtimeSync = {
        flowOk: synced.flowResult.ok,
        orderOk: synced.orderResult.ok,
      };
    }

    success(
      res,
      {
        ...result,
        runtimeSync,
        captureAgentAvailable: available,
      },
      'Da tao session upload'
    );
  } catch (error) {
    next(error);
  }
};

export const prepareUploadFlow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await captureSessionService.prepareUploadSession(req.body, req.user!);
    const available = await captureService.isCaptureServiceReachable();

    let runtimeSync = { flowOk: false, orderOk: false };
    if (available) {
      const synced = await syncSessionToAgent(result.session);
      runtimeSync = {
        flowOk: synced.flowResult.ok,
        orderOk: synced.orderResult.ok,
      };
    }

    const [storage, runtime, serviceInfo] = await Promise.all([
      captureRuntimeService.getVideoStorageUsage(req.user?.shopId ?? null),
      Promise.resolve(captureRuntimeService.getRuntimeStatus(req.user!.userId)),
      serviceInfoPayload(),
    ]);

    success(
      res,
      {
        auth: {
          userId: req.user!.userId,
          shopId: req.user?.shopId ?? null,
          roles: req.user?.roles || [],
        },
        session: result.session,
        order: result.order,
        captureSettings: result.captureSettings,
        uploadPolicy: result.uploadPolicy,
        storage,
        runtime,
        serviceInfo,
        runtimeSync,
        captureAgentAvailable: available,
      },
      'Đã chuẩn bị luồng upload hoàn chỉnh'
    );
  } catch (error) {
    next(error);
  }
};

export const activeUploadSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await captureSessionService.getActiveUploadSession(req.user!);
    success(res, result);
  } catch (error) {
    next(error);
  }
};

export const clearUploadSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = captureSessionService.clearActiveUploadSession(req.user!);
    success(res, result, 'Da xoa session upload');
  } catch (error) {
    next(error);
  }
};

export const getRecordingFlow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = await captureService.isCaptureServiceReachable();
    if (available) {
      await relay(captureService.forwardGet('/api/recording_flow'), res, 'Khong lay duoc che do quay');
      return;
    }

    const runtime = captureRuntimeService.getRuntimeStatus(req.user!.userId);
    success(res, {
      ok: true,
      recording_flow: runtime.recording_flow,
      label: runtime.recording_flow_label,
      locked: runtime.is_recording,
    });
  } catch (error) {
    next(error);
  }
};

export const setRecordingFlow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const flow = req.body?.recording_flow === 'return' ? 'return' : 'outbound';
    captureRuntimeService.setRecordingFlow(req.user!.userId, flow);

    const available = await captureService.isCaptureServiceReachable();
    if (available) {
      await relay(
        captureService.forwardPost('/api/recording_flow', { recording_flow: flow }),
        res,
        'Khong cap nhat duoc che do quay'
      );
      return;
    }

    success(res, {
      ok: true,
      recording_flow: flow,
      label: flow === 'return' ? 'Hang hoan' : 'Hang gui',
      locked: false,
    });
  } catch (error) {
    next(error);
  }
};

export const manualScan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const available = legacyAgentOwnsScan() && (await captureService.isCaptureServiceReachable());
    const useServerRtsp = await shouldUseServerRtspRuntime();

    if (available && !useServerRtsp) {
      await relay(
        captureService.forwardFormPost('/manual-scan-api', { code: req.body?.code ?? '' }),
        res,
        'Khong gui duoc ma scan'
      );
      return;
    }

    const result = await captureRuntimeService.processManualScan(
      { userId: req.user!.userId, roles: req.user!.roles },
      String(req.body?.code || '')
    );
    success(res, result);
  } catch (error) {
    next(error);
  }
};

export const manualOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const orderCode = String(req.body?.orderCode || '').trim();
    const local = await captureRuntimeService.setCurrentOrderFromCode(
      { userId: req.user!.userId, roles: req.user!.roles },
      orderCode
    );
    const available = legacyAgentOwnsScan() && (await captureService.isCaptureServiceReachable());

    if (available) {
      await relay(
        captureService.forwardFormPost(
          '/manual-order',
          { order_code: orderCode },
          { 'X-Requested-With': 'XMLHttpRequest' }
        ),
        res,
        'Khong lay duoc don hang'
      );
      return;
    }

    success(res, local);
  } catch (error) {
    next(error);
  }
};

export const startCameras = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    if (cameraMode === 'rtsp') {
      success(res, await rtspRuntimeService.startRtspCamera(req.user!.userId), 'Da khoi dong RTSP tren server');
      return;
    }

    const selectedCamera = await rtspRuntimeService.getRecordingCameraConfig();
    if (selectedCamera.rtspUrl?.trim() && !(await captureService.isCaptureServiceReachable())) {
      throw badRequest(
        'Camera dang de nguon USB, nhung cau hinh nay da co RTSP URL. Neu muon web server tu khoi dong camera, hay doi nguon sang RTSP.'
      );
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/start_cameras', req.body);
    if (result.ok) {
      captureRuntimeService.markCameraRunning(req.user!.userId, true);
    }
    await relay(Promise.resolve(result), res, 'Khong khoi dong duoc camera');
  } catch (error) {
    next(error);
  }
};

export const testCamera = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    if (cameraMode === 'rtsp') {
      success(res, await rtspRuntimeService.testRtspCamera(req.user!.userId));
      return;
    }

    const selectedCamera = await rtspRuntimeService.getRecordingCameraConfig();
    if (selectedCamera.rtspUrl?.trim() && !(await captureService.isCaptureServiceReachable())) {
      throw badRequest(
        'Camera dang de nguon USB, nhung cau hinh nay da co RTSP URL. Neu muon web server tu test camera, hay doi nguon sang RTSP.'
      );
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/test_camera', req.body);
    captureRuntimeService.markCameraTest(req.user!.userId, result.ok, result.ok ? null : 'Test camera that bai');
    await relay(Promise.resolve(result), res, 'Khong test duoc camera');
  } catch (error) {
    next(error);
  }
};

export const stopCameras = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    if (cameraMode === 'rtsp') {
      success(res, await rtspRuntimeService.stopRtspCamera(req.user!.userId), 'Da dung RTSP tren server');
      return;
    }

    const selectedCamera = await rtspRuntimeService.getRecordingCameraConfig();
    if (selectedCamera.rtspUrl?.trim() && !(await captureService.isCaptureServiceReachable())) {
      throw badRequest(
        'Camera dang de nguon USB, nhung cau hinh nay da co RTSP URL. Neu muon web server tu dung camera, hay doi nguon sang RTSP.'
      );
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/stop_cameras', req.body);
    if (result.ok) {
      captureRuntimeService.markCameraRunning(req.user!.userId, false);
    }
    await relay(Promise.resolve(result), res, 'Khong dung duoc camera');
  } catch (error) {
    next(error);
  }
};

export const startRecording = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const browserMode = req.body?.mode === 'browser';
    if (browserMode) {
      await captureSessionService.ensureActiveRecordingSession(req.user!, 'packaging');
      captureRuntimeService.markRecordingStarted(req.user!.userId);
      success(res, { ok: true, mode: 'browser-usb-recording' }, 'Da bat dau quay tren trinh duyet');
      return;
    }

    const cameraMode = await rtspRuntimeService.getCameraMode();
    const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
    if (cameraMode === 'rtsp' && rtspServerAvailable) {
      success(res, await rtspRecordingService.startRtspRecording(req.user!), 'Da bat dau quay RTSP tren server');
      return;
    }

    await requireCaptureAgent();
    const session = captureSessionService.getActiveUploadSessionEntity(req.user!);
    if (session) {
      const runtimeSync = await syncSessionToAgent(session);
      if (!runtimeSync.orderResult.ok) {
        return res.status(runtimeSync.orderResult.status).json({
          success: false,
          message: 'Khong dong bo duoc don hang sang capture agent',
          data: runtimeSync.orderResult.data,
        });
      }
    }

    const result = await captureService.forwardPost('/start_recording', req.body);
    if (result.ok) {
      captureRuntimeService.markRecordingStarted(req.user!.userId);
    }
    await relay(Promise.resolve(result), res, 'Khong bat dau quay duoc');
  } catch (error) {
    next(error);
  }
};

export const stopRecording = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const browserMode = req.body?.mode === 'browser';
    if (browserMode) {
      captureRuntimeService.markRecordingStopped(req.user!.userId);
      success(res, { ok: true, mode: 'browser-usb-recording' }, 'Da dung quay tren trinh duyet');
      return;
    }

    const cameraMode = await rtspRuntimeService.getCameraMode();
    const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
    if (cameraMode === 'rtsp' && rtspServerAvailable) {
      success(res, await rtspRecordingService.stopRtspRecording(req.user!), 'Da ket thuc quay RTSP tren server');
      return;
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/stop_recording', req.body);
    if (result.ok) {
      captureRuntimeService.markRecordingStopped(req.user!.userId);
    }
    await relay(Promise.resolve(result), res, 'Khong dung quay duoc');
  } catch (error) {
    next(error);
  }
};

export const pauseRecording = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
    if (cameraMode === 'rtsp' && rtspServerAvailable) {
      success(res, await rtspRecordingService.pauseRtspRecording(req.user!), 'Da tam dung quay RTSP tren server');
      return;
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/pause_recording', req.body);
    if (result.ok) {
      captureRuntimeService.markRecordingPaused(req.user!.userId);
    }
    await relay(Promise.resolve(result), res, 'Khong tam dung quay duoc');
  } catch (error) {
    next(error);
  }
};

export const resumeRecording = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
    if (cameraMode === 'rtsp' && rtspServerAvailable) {
      success(res, await rtspRecordingService.resumeRtspRecording(req.user!), 'Da tiep tuc quay RTSP tren server');
      return;
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/resume_recording', req.body);
    if (result.ok) {
      captureRuntimeService.markRecordingResumed(req.user!.userId);
    }
    await relay(Promise.resolve(result), res, 'Khong tiep tuc quay duoc');
  } catch (error) {
    next(error);
  }
};

export const cancelRecording = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cameraMode = await rtspRuntimeService.getCameraMode();
    const rtspServerAvailable = await rtspRuntimeService.canHandleServerSideRtsp();
    if (cameraMode === 'rtsp' && rtspServerAvailable) {
      success(res, await rtspRecordingService.cancelRtspRecording(req.user!), 'Da huy phien quay RTSP tren server');
      return;
    }

    await requireCaptureAgent();
    const result = await captureService.forwardPost('/cancel_recording', req.body);
    if (result.ok) {
      captureRuntimeService.markRecordingStopped(req.user!.userId);
    }
    await relay(Promise.resolve(result), res, 'Khong huy duoc phien quay');
  } catch (error) {
    next(error);
  }
};

export const rtspPreview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const camera = await rtspRuntimeService.getRecordingCameraConfig();
    if (camera.sourceType !== 'rtsp' || !camera.rtspUrl.trim()) {
      throw badRequest('Camera dang chon khong phai RTSP');
    }

    const ffmpeg = spawn(
      getFfmpegPath(),
      [
        '-rtsp_transport',
        'tcp',
        '-i',
        camera.rtspUrl,
        '-vf',
        'fps=5,scale=960:-1',
        '-q:v',
        '6',
        '-f',
        'mpjpeg',
        'pipe:1',
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    let stderr = '';
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', (error) => {
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: error.message });
      }
    });

    res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=ffserver');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    ffmpeg.stdout.pipe(res);

    req.on('close', () => {
      ffmpeg.kill('SIGTERM');
    });

    ffmpeg.on('close', () => {
      if (!res.writableEnded) {
        res.end();
      }
      if (stderr && !res.headersSent) {
        res.status(502).json({ success: false, message: stderr.slice(-300) });
      }
    });
  } catch (error) {
    next(error);
  }
};

export const cleanupUploads = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await uploadQueueService.forceCleanup(), 'Da chay cleanup queue va tep tam');
  } catch (error) {
    next(error);
  }
};

export const resetOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    captureSessionService.clearActiveUploadSession(req.user!);

    const available = await captureService.isCaptureServiceReachable();
    if (available) {
      await relay(captureService.forwardPost('/reset_order', req.body), res, 'Khong reset duoc phien dong goi');
      return;
    }

    success(res, { ok: true, reset: true }, 'Da reset phien dong goi');
  } catch (error) {
    next(error);
  }
};
