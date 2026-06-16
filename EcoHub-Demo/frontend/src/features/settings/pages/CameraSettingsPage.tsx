import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Info, RefreshCw, UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  CaptureCameraConfig,
  CaptureSettings,
  CaptureSettingsOverview,
  settingsApi,
} from '@/api/settings.api';
import { captureApi, CaptureTestCameraResponse } from '@/api/capture.api';
import { getErrorMessage } from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuthStore } from '@/store/authStore';

const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
  cameraConfigs: [
    { slotIndex: 0, enabled: true, sourceType: 'usb', cameraIndex: 0, rtspUrl: '', width: 1280, height: 720, fps: 20 },
    { slotIndex: 1, enabled: false, sourceType: 'usb', cameraIndex: 1, rtspUrl: '', width: 1280, height: 720, fps: 20 },
  ],
  scanSensitivity: 'normal',
  qrCooldownSeconds: 5,
  recordingCameraSlot: 0,
  employeeSession: { employeeName: '', employeeCode: '', workSessionLabel: '' },
};

const normalizeCaptureSettings = (value?: Partial<CaptureSettings> | null): CaptureSettings => ({
  ...DEFAULT_CAPTURE_SETTINGS,
  ...value,
  cameraConfigs: Array.from({ length: 2 }, (_, slotIndex) => {
    const existing = value?.cameraConfigs?.find((item) => item.slotIndex === slotIndex);
    return existing
      ? { ...DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex], ...existing }
      : DEFAULT_CAPTURE_SETTINGS.cameraConfigs[slotIndex];
  }),
  employeeSession: {
    ...DEFAULT_CAPTURE_SETTINGS.employeeSession,
    ...(value?.employeeSession || {}),
  },
});

const getBrowserCameraErrorMessageLegacy = (error: unknown) => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 'Trình duyệt hoặc địa chỉ hiện tại không hỗ trợ truy cập webcam. Hãy mở bằng HTTPS, localhost hoặc 127.0.0.1.';
  }

  const rawMessage = getErrorMessage(error);
  if (/NotAllowedError|Permission denied|Permission dismissed/i.test(rawMessage)) {
    return 'Trình duyệt đang chặn quyền truy cập camera. Hãy cho phép camera rồi thử lại.';
  }
  if (/NotFoundError|Requested device not found/i.test(rawMessage)) {
    return 'Không tìm thấy webcam trên máy này.';
  }
  if (/NotReadableError|Could not start video source/i.test(rawMessage)) {
    return 'Webcam đang bị ứng dụng khác chiếm dụng hoặc không thể mở.';
  }

  return rawMessage;
};

const getBrowserCameraErrorMessage = (error: unknown) => {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    return 'Trình duyệt hoặc ngữ cảnh hiện tại không hỗ trợ truy cập webcam. Hãy mở bằng HTTPS hoặc localhost/127.0.0.1.';
  }

  const rawMessage = getErrorMessage(error);
  if (/NotAllowedError|Permission denied|Permission dismissed/i.test(rawMessage)) {
    return 'Trình duyệt đang chặn quyền truy cập camera. Hãy cho phép camera rồi thử lại.';
  }
  if (/NotFoundError|Requested device not found/i.test(rawMessage)) {
    return 'Không tìm thấy webcam trên máy này.';
  }
  if (/NotReadableError|Could not start video source/i.test(rawMessage)) {
    return 'Webcam đang bị ứng dụng khác chiếm dụng hoặc không thể mở.';
  }

  return rawMessage;
};

export default function CameraSettingsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canEditCapture = user?.roles?.some((role) => ['super_admin', 'admin', 'staff'].includes(role)) ?? false;
  const [captureSettings, setCaptureSettings] = useState<CaptureSettings>(DEFAULT_CAPTURE_SETTINGS);
  const [captureActionBusy, setCaptureActionBusy] = useState(false);
  const [cameraTestResult, setCameraTestResult] = useState<CaptureTestCameraResponse | null>(null);
  const [browserCameraRunning, setBrowserCameraRunning] = useState(false);
  const browserVideoRef = useRef<HTMLVideoElement | null>(null);
  const browserStreamRef = useRef<MediaStream | null>(null);

  const {
    data: captureOverview,
    isLoading: loadingCaptureSettings,
    refetch: refetchCaptureOverview,
    isFetching: refreshingOverview,
  } = useQuery({
    queryKey: ['capture-settings'],
    queryFn: settingsApi.getCaptureSettings,
  });

  useEffect(() => {
    if (captureOverview) {
      setCaptureSettings(normalizeCaptureSettings(captureOverview));
    }
  }, [captureOverview]);

  useEffect(() => {
    return () => {
      browserStreamRef.current?.getTracks().forEach((track) => track.stop());
      browserStreamRef.current = null;
    };
  }, []);

  const captureMutation = useMutation({
    mutationFn: settingsApi.updateCaptureSettings,
    onSuccess: (data) => {
      const normalized = normalizeCaptureSettings(data);
      setCaptureSettings(normalized);
      queryClient.setQueryData(['capture-settings'], data);
      toast.success('Đã lưu cấu hình camera');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateCameraConfig = (slotIndex: number, updater: (current: CaptureCameraConfig) => CaptureCameraConfig) => {
    setCaptureSettings((current) => ({
      ...current,
      cameraConfigs: current.cameraConfigs.map((camera) =>
        camera.slotIndex === slotIndex ? updater(camera) : camera
      ),
    }));
  };

  const runCameraAction = async (
    action: () => Promise<unknown>,
    successMessage?: string,
    options?: { suppressErrorToast?: boolean }
  ) => {
    setCaptureActionBusy(true);
    try {
      const result = await action();
      if (successMessage) toast.success(successMessage);
      const refreshed = await refetchCaptureOverview();
      if (refreshed.data) {
        queryClient.setQueryData(['capture-settings'], refreshed.data);
      }
      return result;
    } catch (err) {
      if (!options?.suppressErrorToast) {
        toast.error(getErrorMessage(err));
      }
      return null;
    } finally {
      setCaptureActionBusy(false);
    }
  };

  const overview = (captureOverview || null) as CaptureSettingsOverview | null;
  const captureAgentAvailable = Boolean(overview?.serviceInfo?.captureAgentAvailable);
  const rtspServerAvailable = Boolean(overview?.serviceInfo?.rtspServerAvailable);
  const preferredRuntime = overview?.serviceInfo?.preferredRuntime || 'server-local';
  const enabledCameraConfigs = captureSettings.cameraConfigs.filter((camera) => camera.enabled);
  const previewCameraCount = Math.max(enabledCameraConfigs.length, 1);
  const availableCameraIndices = overview?.availableCameraIndices?.length ? overview.availableCameraIndices : [0, 1];
  const recordingLocked = Boolean(overview?.recordingLocked);
  const activeRecordingCamera =
    captureSettings.cameraConfigs.find((camera) => camera.slotIndex === captureSettings.recordingCameraSlot) ||
    captureSettings.cameraConfigs[0];
  const activeCameraMode = activeRecordingCamera?.sourceType || 'usb';
  const cameraRunning =
    activeCameraMode === 'usb' && !captureAgentAvailable
      ? browserCameraRunning
      : Boolean(overview?.cameraStatus?.running);
  const cameraStatusError = typeof overview?.cameraStatus?.error === 'string' ? overview.cameraStatus.error : '';
  const captureBaseUrl = overview?.serviceInfo?.baseUrl || 'http://127.0.0.1:5000';

  const handleTestCamera = async () => {
    if (activeCameraMode === 'usb' && !captureAgentAvailable) {
      setCaptureActionBusy(true);
      try {
        if (
          typeof navigator === 'undefined' ||
          !navigator.mediaDevices ||
          typeof navigator.mediaDevices.getUserMedia !== 'function'
        ) {
          throw new Error('getUserMedia_unavailable');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: activeRecordingCamera?.width || 1280 },
            height: { ideal: activeRecordingCamera?.height || 720 },
            frameRate: { ideal: activeRecordingCamera?.fps || 20 },
          },
          audio: false,
        });
        stream.getTracks().forEach((track) => track.stop());
        setCameraTestResult({
          success: true,
          message: 'Webcam test thành công trên trình duyệt',
          source_type: 'usb',
          recording_camera_slot: activeRecordingCamera?.slotIndex,
        });
      } catch (err) {
        setCameraTestResult({
          success: false,
          error: getBrowserCameraErrorMessage(err),
          source_type: 'usb',
          recording_camera_slot: activeRecordingCamera?.slotIndex,
        });
      } finally {
        setCaptureActionBusy(false);
      }
      return;
    }

    const result = await runCameraAction(() => captureApi.testCamera());
    if (result) setCameraTestResult(result as CaptureTestCameraResponse);
  };

  const startBrowserCamera = async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new Error(
        'Trình duyệt hoặc địa chỉ hiện tại không hỗ trợ truy cập webcam. Hãy mở bằng HTTPS, localhost hoặc 127.0.0.1.'
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: activeRecordingCamera?.width || 1280 },
        height: { ideal: activeRecordingCamera?.height || 720 },
        frameRate: { ideal: activeRecordingCamera?.fps || 20 },
      },
      audio: false,
    });
    browserStreamRef.current?.getTracks().forEach((track) => track.stop());
    browserStreamRef.current = stream;
    if (browserVideoRef.current) {
      browserVideoRef.current.srcObject = stream;
      browserVideoRef.current.play().catch(() => undefined);
    }
    setBrowserCameraRunning(true);
    setCameraTestResult(null);
  };

  const stopBrowserCamera = () => {
    browserStreamRef.current?.getTracks().forEach((track) => track.stop());
    browserStreamRef.current = null;
    if (browserVideoRef.current) {
      browserVideoRef.current.srcObject = null;
    }
    setBrowserCameraRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-teal-700 to-emerald-600 p-6 text-white">
        <h1 className="text-2xl font-bold">Cài đặt camera</h1>
        <p className="mt-2 text-sm text-emerald-50">
          Quản lý camera, thông số quét mã, ca làm việc và chọn chế độ vận hành RTSP trên web server.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Điều khiển camera
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeCameraMode === 'rtsp' ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                rtspServerAvailable
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {rtspServerAvailable
                ? 'RTSP đang được xử lý trên backend server. Bạn có thể test, start và stop camera mà không cần runtime Python cục bộ.'
                : 'RTSP đang được chọn, nhưng server chưa có ffprobe/ffmpeg. Cài ffprobe/ffmpeg để web server tự test camera.'}
            </div>
          ) : !captureAgentAvailable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Camera USB vẫn cần local runtime. Nếu muốn bỏ hoàn toàn local app, hãy chuyển nguồn camera sang RTSP/IP để server có thể kết nối trực tiếp.
            </div>
          ) : null}

          {activeCameraMode === 'usb' && activeRecordingCamera?.rtspUrl?.trim() ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Bạn đã nhập RTSP URL cho camera đang quay, nhưng nguồn camera hiện vẫn để ở USB / Webcam. Nếu muốn web server tự test và điều khiển camera, hãy đổi nguồn sang RTSP.
            </div>
          ) : null}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge variant={cameraRunning ? 'success' : cameraStatusError ? 'danger' : 'default'}>
                  {cameraRunning ? 'Đang chạy' : cameraStatusError ? 'Lỗi camera' : 'Chưa khởi động'}
                </Badge>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                {cameraRunning
                  ? 'Camera đang hoạt động bình thường.'
                  : cameraStatusError ||
                    (activeCameraMode === 'rtsp'
                      ? 'Camera RTSP chưa khởi động. Nhấn Test Camera để backend kiểm tra stream, sau đó Start Camera.'
                      : 'Camera USB chưa khởi động. Nếu không dùng local runtime, hãy đổi sang RTSP để chạy trực tiếp từ server.')}
              </div>
              <div className="text-xs text-gray-500">Runtime ưu tiên: {preferredRuntime}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500"
              onClick={() => refetchCaptureOverview()}
              loading={refreshingOverview}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Làm mới
            </Button>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handleTestCamera}
              disabled={!canEditCapture || recordingLocked}
              loading={captureActionBusy}
            >
              Test Camera
            </Button>
            <Button
              variant="success"
              onClick={() =>
                activeCameraMode === 'usb' && !captureAgentAvailable
                  ? runCameraAction(
                      async () => {
                        try {
                          await startBrowserCamera();
                        } catch (err) {
                          setCameraTestResult({
                            success: false,
                            error: getBrowserCameraErrorMessage(err),
                            source_type: 'usb',
                            recording_camera_slot: activeRecordingCamera?.slotIndex,
                          });
                          throw err;
                        }
                      },
                      'Đã mở webcam trên trình duyệt',
                      {
                        suppressErrorToast: true,
                      }
                    )
                  : runCameraAction(() => captureApi.startCameras(), 'Đã khởi động camera')
              }
              disabled={!canEditCapture || cameraRunning || recordingLocked}
              loading={captureActionBusy}
            >
              Start Camera
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                activeCameraMode === 'usb' && !captureAgentAvailable
                  ? runCameraAction(async () => stopBrowserCamera(), 'Đã dừng webcam trên trình duyệt', {
                      suppressErrorToast: true,
                    })
                  : runCameraAction(() => captureApi.stopCameras(), 'Đã dừng camera')
              }
              disabled={!canEditCapture || !cameraRunning}
              loading={captureActionBusy}
            >
              Stop Camera
            </Button>
          </div>

          {recordingLocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Đang có phiên quay video. Tạm khóa thay đổi cấu hình camera đến khi kết thúc quay.
            </div>
          ) : null}

          {cameraTestResult ? (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                cameraTestResult.success
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              <div className="font-medium">
                {cameraTestResult.success
                  ? cameraTestResult.message || 'Camera test thành công'
                  : cameraTestResult.error || 'Test camera thất bại'}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cấu hình camera và AI quét mã</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loadingCaptureSettings ? (
            <div className="py-6 text-center text-gray-500">Đang tải cấu hình camera...</div>
          ) : (
            <>
              <div className="space-y-4 rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                  <UserCircle2 className="h-5 w-5 text-emerald-600" />
                  <p className="font-medium text-gray-900">Phien lam viec nhan vien</p>
                </div>
                <Input
                  label="Ten nhan vien"
                  value={captureSettings.employeeSession.employeeName}
                  disabled={!canEditCapture || recordingLocked}
                  onChange={(e) =>
                    setCaptureSettings((current) => ({
                      ...current,
                      employeeSession: { ...current.employeeSession, employeeName: e.target.value },
                    }))
                  }
                />
                <Input
                  label="Ma nhan vien"
                  value={captureSettings.employeeSession.employeeCode}
                  disabled={!canEditCapture || recordingLocked}
                  onChange={(e) =>
                    setCaptureSettings((current) => ({
                      ...current,
                      employeeSession: { ...current.employeeSession, employeeCode: e.target.value },
                    }))
                  }
                />
                <Input
                  label="Ca lam / nhan phien"
                  value={captureSettings.employeeSession.workSessionLabel}
                  disabled={!canEditCapture || recordingLocked}
                  onChange={(e) =>
                    setCaptureSettings((current) => ({
                      ...current,
                      employeeSession: { ...current.employeeSession, workSessionLabel: e.target.value },
                    }))
                  }
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {captureSettings.cameraConfigs.map((camera) => (
                  <div key={camera.slotIndex} className="space-y-4 rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">Camera {camera.slotIndex + 1}</p>
                        <p className="text-sm text-gray-500">Chon USB hoac RTSP cho tung camera.</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={camera.enabled}
                          disabled={!canEditCapture || recordingLocked}
                          onChange={(e) =>
                            updateCameraConfig(camera.slotIndex, (current) => ({
                              ...current,
                              enabled: e.target.checked,
                            }))
                          }
                        />
                        Bat
                      </label>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
                        label="Nguon camera"
                        value={camera.sourceType}
                        disabled={!canEditCapture || recordingLocked}
                        onChange={(e) =>
                          updateCameraConfig(camera.slotIndex, (current) => ({
                            ...current,
                            sourceType: e.target.value as CaptureCameraConfig['sourceType'],
                          }))
                        }
                        options={[
                          { value: 'usb', label: 'USB / Webcam' },
                          { value: 'rtsp', label: 'RTSP / IP Camera' },
                        ]}
                      />
                      <Input
                        label="Camera index"
                        type="number"
                        value={camera.cameraIndex}
                        disabled={!canEditCapture || recordingLocked || camera.sourceType !== 'usb'}
                        onChange={(e) =>
                          updateCameraConfig(camera.slotIndex, (current) => ({
                            ...current,
                            cameraIndex: Number(e.target.value || 0),
                          }))
                        }
                      />
                    </div>

                    {camera.sourceType === 'usb' ? (
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                        USB camera goi y: {availableCameraIndices.map((value) => `Camera ${value}`).join(', ')}
                      </div>
                    ) : (
                      <div
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          rtspServerAvailable
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                      >
                        {rtspServerAvailable
                          ? 'RTSP co the duoc test tu backend server.'
                          : 'RTSP hien chua test server-side duoc vi server thieu ffprobe/ffmpeg.'}
                      </div>
                    )}

                    <Input
                      label="RTSP URL"
                      value={camera.rtspUrl}
                      disabled={!canEditCapture || recordingLocked || camera.sourceType !== 'rtsp'}
                      onChange={(e) =>
                        updateCameraConfig(camera.slotIndex, (current) => ({
                          ...current,
                          rtspUrl: e.target.value,
                        }))
                      }
                      placeholder="rtsp://user:pass@ip:554/Streaming/Channels/101"
                    />

                    <div className="grid gap-4 md:grid-cols-3">
                      <Input
                        label="Width"
                        type="number"
                        value={camera.width}
                        disabled={!canEditCapture || recordingLocked}
                        onChange={(e) =>
                          updateCameraConfig(camera.slotIndex, (current) => ({
                            ...current,
                            width: Number(e.target.value || 1280),
                          }))
                        }
                      />
                      <Input
                        label="Height"
                        type="number"
                        value={camera.height}
                        disabled={!canEditCapture || recordingLocked}
                        onChange={(e) =>
                          updateCameraConfig(camera.slotIndex, (current) => ({
                            ...current,
                            height: Number(e.target.value || 720),
                          }))
                        }
                      />
                      <Input
                        label="FPS"
                        type="number"
                        value={camera.fps}
                        disabled={!canEditCapture || recordingLocked}
                        onChange={(e) =>
                          updateCameraConfig(camera.slotIndex, (current) => ({
                            ...current,
                            fps: Number(e.target.value || 20),
                          }))
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-emerald-600" />
                  <p className="text-lg font-semibold text-gray-900">Xem truoc</p>
                </div>
                {cameraRunning ? (
                  activeCameraMode === 'usb' && !captureAgentAvailable ? (
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-slate-950">
                      <video ref={browserVideoRef} className="aspect-video w-full object-cover" muted playsInline />
                    </div>
                  ) : (
                    <div className={`grid gap-4 ${previewCameraCount > 1 ? 'lg:grid-cols-2' : ''}`}>
                      {Array.from({ length: previewCameraCount }, (_, index) => {
                        const previewUrl =
                          previewCameraCount > 1
                            ? `${captureBaseUrl}/video_feed/${index}`
                            : `${captureBaseUrl}/video_feed`;
                        return (
                          <div
                            key={previewUrl}
                            className="overflow-hidden rounded-xl border border-gray-200 bg-slate-950"
                          >
                            <div className="border-b border-slate-800 px-4 py-2 text-sm font-medium text-slate-200">
                              Camera {index + 1}
                            </div>
                            <img
                              src={previewUrl}
                              alt={`Camera ${index + 1}`}
                              className="aspect-video w-full object-contain"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-center text-gray-500">
                    <div>
                      <Camera className="mx-auto mb-3 h-12 w-12 opacity-40" />
                      <p className="font-medium">Camera chua khoi dong</p>
                      <p className="mt-1 text-sm">
                        {activeCameraMode === 'rtsp'
                          ? 'RTSP hien dang test/start tren server. Live preview server-side se duoc bo sung tiep theo.'
                          : 'USB camera can local runtime de xem preview truc tiep.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={() => captureMutation.mutate(captureSettings)}
                  disabled={!canEditCapture || recordingLocked}
                  loading={captureMutation.isPending}
                >
                  Luu cau hinh camera
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
