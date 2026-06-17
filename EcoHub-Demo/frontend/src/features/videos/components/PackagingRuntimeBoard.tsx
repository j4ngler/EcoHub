import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Clock3, HardDrive, Package2, Pause, Play, RotateCcw, ScanLine, Square, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { captureApi } from '@/api/capture.api';
import { getErrorMessage } from '@/api/axios';
import { settingsApi } from '@/api/settings.api';
import { videosApi } from '@/api/videos.api';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useAuthStore } from '@/store/authStore';
import {
  getBrowserCameraStream,
  isBrowserCameraRunning,
  startSharedBrowserCamera,
  stopSharedBrowserCamera,
  subscribeBrowserCamera,
} from '@/features/videos/browserCameraRuntime';

const formatSeconds = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const formatStorage = (bytes: number) => {
  const gb = bytes / 1024 ** 3;
  const mb = bytes / 1024 ** 2;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
};

const selectVideoDeviceId = async (cameraIndex: number) => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  return videoInputs[cameraIndex]?.deviceId || videoInputs[0]?.deviceId || null;
};

export default function PackagingRuntimeBoard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [scanCode, setScanCode] = useState('');
  const [manualOrderCode, setManualOrderCode] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [recordingFlow, setRecordingFlow] = useState<'outbound' | 'return'>('outbound');
  const [clock, setClock] = useState(() => new Date());
  const [browserCameraRunning, setBrowserCameraRunning] = useState(() => isBrowserCameraRunning());
  const [browserRecording, setBrowserRecording] = useState(false);
  const [browserUploadBusy, setBrowserUploadBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return subscribeBrowserCamera((stream) => {
      setBrowserCameraRunning(Boolean(stream));
      attachStreamToPreview(stream);
    });
  }, []);

  const { data: serviceInfo } = useQuery({
    queryKey: ['capture-service-info'],
    queryFn: captureApi.getServiceInfo,
    retry: false,
  });

  const { data: captureSettings } = useQuery({
    queryKey: ['capture-settings'],
    queryFn: settingsApi.getCaptureSettings,
    retry: false,
  });

  const { data: runtimeStatus, refetch: refetchRuntimeStatus } = useQuery({
    queryKey: ['capture-runtime-status'],
    queryFn: captureApi.getRuntimeStatus,
    refetchInterval: 1000,
    retry: false,
  });

  const { data: cameraStatus, refetch: refetchCameraStatus } = useQuery({
    queryKey: ['capture-dashboard-camera-status'],
    queryFn: captureApi.getCameraStatus,
    refetchInterval: 2000,
    retry: false,
  });

  const { data: storageUsage, refetch: refetchStorageUsage } = useQuery({
    queryKey: ['capture-video-storage-usage'],
    queryFn: captureApi.getVideoStorageUsage,
    refetchInterval: 10000,
    retry: false,
  });
  const { data: uploadStatus, refetch: refetchUploadStatus } = useQuery({
    queryKey: ['capture-upload-status'],
    queryFn: captureApi.getUploadStatus,
    refetchInterval: 5000,
    retry: false,
  });

  useEffect(() => {
    setRecordingFlow(runtimeStatus?.recording_flow === 'return' ? 'return' : 'outbound');
  }, [runtimeStatus?.recording_flow]);

  const selectedRecordingCamera = useMemo(() => {
    if (!captureSettings) return null;
    return (
      captureSettings.cameraConfigs.find((camera) => camera.slotIndex === captureSettings.recordingCameraSlot) ||
      captureSettings.cameraConfigs[0] ||
      null
    );
  }, [captureSettings]);

  const cameraMode = selectedRecordingCamera?.sourceType || serviceInfo?.cameraMode || 'usb';
  const captureAgentAvailable = Boolean(serviceInfo?.captureAgentAvailable);
  const rtspServerAvailable = Boolean(serviceInfo?.rtspServerAvailable);
  const serverHandlesCamera = Boolean(serviceInfo?.serverHandlesCamera);
  const cameraRunning = cameraMode === 'usb' && !captureAgentAvailable
    ? browserCameraRunning
    : Boolean((cameraStatus as any)?.running);
  const isRecording = cameraMode === 'usb' && !captureAgentAvailable
    ? browserRecording
    : Boolean(runtimeStatus?.is_recording);
  const numCameras = Number(runtimeStatus?.num_cameras || 1);
  const baseUrl = serviceInfo?.baseUrl || 'http://127.0.0.1:5000';
  const currentOrderCode = runtimeStatus?.current_order_code || '';
  const orderInfo = runtimeStatus?.order_info;
  const packingItems = runtimeStatus?.packing_state?.items || [];
  const storage = (storageUsage as any)?.usage;
  const previewUrl = cameraMode === 'rtsp' && accessToken ? captureApi.getRtspPreviewUrl(accessToken) : null;

  const refreshAll = async () => {
    await Promise.all([refetchRuntimeStatus(), refetchCameraStatus(), refetchStorageUsage(), refetchUploadStatus()]);
  };

  const ensureUploadSession = async () => {
    const existing = await captureApi.getActiveSession();
    if (existing?.session) return existing.session;

    const orderId = runtimeStatus?.order_info?.order_id;
    if (!orderId) {
      throw new Error('Chưa có đơn hàng hiện tại để tạo phiên ghi hình');
    }

    const prepared = await captureApi.prepareUploadFlow({
      orderId,
      module: 'packaging',
      recordingFlow,
    });
    return prepared.session;
  };

  const attachStreamToPreview = (stream: MediaStream | null) => {
    if (!liveVideoRef.current) return;
    liveVideoRef.current.srcObject = stream;
    if (stream) {
      liveVideoRef.current.play().catch(() => undefined);
    }
  };

  useEffect(() => {
    attachStreamToPreview(getBrowserCameraStream());
  }, [browserCameraRunning]);

  const startBrowserCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trinh duyet khong ho tro webcam API');
    }

    const deviceId = await selectVideoDeviceId(selectedRecordingCamera?.cameraIndex || 0);
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? {
            deviceId: { exact: deviceId },
            width: { ideal: selectedRecordingCamera?.width || 1280 },
            height: { ideal: selectedRecordingCamera?.height || 720 },
            frameRate: { ideal: selectedRecordingCamera?.fps || 20 },
          }
        : true,
      audio: false,
    };

    const stream = await startSharedBrowserCamera(constraints);
    attachStreamToPreview(stream);
    setBrowserCameraRunning(true);
  };

  const stopBrowserCamera = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    stopSharedBrowserCamera();
    attachStreamToPreview(null);
    setBrowserCameraRunning(false);
    setBrowserRecording(false);
  };

  const uploadBrowserRecording = async (blob: Blob) => {
    const session = await ensureUploadSession();
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([blob], `${session.orderCode}-${Date.now()}.${extension}`, {
      type: blob.type || 'video/webm',
    });

    const formData = new FormData();
    formData.append('video', file);
    formData.append('orderId', session.orderId);
    formData.append('trackingCode', session.trackingCode);
    formData.append('trackingCodePosition', 'bottom_right');

    await videosApi.uploadVideo(formData);
    await captureApi.clearActiveSession();
    await captureApi.resetOrder();
  };

  const startBrowserRecording = async () => {
    let stream = getBrowserCameraStream();
    if (!browserCameraRunning || !stream) {
      await startBrowserCamera();
      stream = getBrowserCameraStream();
    }

    if (!stream) {
      throw new Error('Khong mo duoc webcam de ghi hinh');
    }

    await ensureUploadSession();
    await captureApi.startRecording({ mode: 'browser' });
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm;codecs=vp8';
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_200_000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      try {
        setBrowserUploadBusy(true);
        const blob = new Blob(chunksRef.current, { type: mimeType });
        await uploadBrowserRecording(blob);
        toast.success('Đã quay và upload video thành công');
        await refreshAll();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        try {
          await captureApi.stopRecording({ mode: 'browser' });
        } catch {
          // Ignore stop-sync errors after browser recording ended locally.
        }
        setBrowserUploadBusy(false);
        setBrowserRecording(false);
        chunksRef.current = [];
      }
    };

    recorder.start(1000);
    setBrowserRecording(true);
  };

  const stopBrowserRecording = async () => {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      await captureApi.stopRecording({ mode: 'browser' });
      setBrowserRecording(false);
      return;
    }
    recorderRef.current.stop();
  };

  const runAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    setCaptureBusy(true);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await refreshAll();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCaptureBusy(false);
    }
  };

  const handleManualScan = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = scanCode.trim();
    if (!value) return;
    await runAction(async () => {
      await captureApi.manualScan(value);
      setScanCode('');
    });
  };

  const handleManualOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = manualOrderCode.trim();
    if (!value) return;
    await runAction(async () => {
      await captureApi.manualOrder(value);
      setManualOrderCode('');
    }, `Đã lấy đơn: ${value}`);
  };

  const handleRecordingFlow = async (flow: 'outbound' | 'return') => {
    setRecordingFlow(flow);
    await runAction(
      async () => captureApi.setRecordingFlow(flow),
      flow === 'return' ? 'Đã chuyển sang hàng hoàn' : 'Đã chuyển sang hàng gửi'
    );
  };

  const handleStartCamera = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      await runAction(startBrowserCamera, 'Da mo webcam tren trinh duyet');
      return;
    }
    await runAction(() => captureApi.startCameras(), 'Da khoi dong camera');
  };

  const handleStopCamera = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      stopBrowserCamera();
      toast.success('Da dung webcam tren trinh duyet');
      await refreshAll();
      return;
    }
    await runAction(() => captureApi.stopCameras(), 'Da dung camera');
  };

  const handleStartRecording = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      setCaptureBusy(true);
      try {
        await startBrowserRecording();
        toast.success('Da bat dau quay tren trinh duyet');
        await refreshAll();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCaptureBusy(false);
      }
      return;
    }

    await runAction(() => captureApi.startRecording(), 'Da bat dau quay');
  };

  const handleStopRecording = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      setCaptureBusy(true);
      try {
        await stopBrowserRecording();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCaptureBusy(false);
      }
      return;
    }

    await runAction(() => captureApi.stopRecording(), 'Da ket thuc quay');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5 text-emerald-600" />
                Camera live
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={cameraRunning ? 'success' : 'default'}>
                  {cameraRunning ? 'Đang chạy' : 'Chưa khởi động'}
                </Badge>
                <div className="rounded-lg bg-slate-100 px-3 py-1 font-mono text-sm text-slate-700">
                  {clock.toISOString().slice(0, 19).replace('T', ' ')}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3">
            {cameraMode === 'usb' && !captureAgentAvailable ? (
              <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Đang dùng webcam trên browser. Bạn không cần Python local, nhưng cần giữ tab này mở trong lúc quay.
              </div>
            ) : null}
            {cameraMode === 'rtsp' && serverHandlesCamera ? (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Đang dùng RTSP server-side. Start/stop/record sẽ được xử lý trên backend server.
              </div>
            ) : null}
            {cameraMode === 'rtsp' && !rtspServerAvailable ? (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Server chưa có ffprobe/ffmpeg, nên RTSP chưa thể được ghi hình trên backend.
              </div>
            ) : null}

            {cameraMode === 'usb' && !captureAgentAvailable ? (
              <div className="overflow-hidden rounded-xl border bg-slate-950">
                <video ref={liveVideoRef} className="aspect-video w-full object-cover" muted playsInline />
                {!browserCameraRunning ? (
                  <div className="flex aspect-video items-center justify-center text-slate-300">
                    <div className="text-center">
                      <Camera className="mx-auto mb-4 h-14 w-14 opacity-40" />
                      <p className="text-lg font-semibold">Webcam chưa mở</p>
                      <p className="mt-1 text-sm text-slate-400">Nhấn Start Camera để xin quyền webcam và mở preview.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : cameraRunning && previewUrl ? (
              <div className="overflow-hidden rounded-xl border bg-slate-950">
                <img src={previewUrl} alt="RTSP preview" className="aspect-video w-full object-cover" />
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-xl border bg-slate-900 text-slate-300">
                <div className="text-center">
                  <Camera className="mx-auto mb-4 h-14 w-14 opacity-40" />
                  <p className="text-lg font-semibold">Camera chưa khởi động</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {cameraMode === 'rtsp'
                      ? 'Chọn RTSP hợp lệ trong Cài đặt camera, sau đó dùng Test / Start / Record ngay trên web server.'
                      : 'Nhấn Start Camera để mở webcam trong trình duyệt.'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ma don hien tai</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-3xl font-bold text-blue-600">{currentOrderCode || 'Chưa chọn đơn'}</p>
              <Button
                variant="outline"
                size="sm"
                loading={captureBusy}
                onClick={() => runAction(() => captureApi.resetOrder(), 'Da reset ma hien tai')}
              >
                Reset mã
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
            <CardTitle>Quét mã bằng đầu đọc</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleManualScan}>
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                    <ScanLine className="h-5 w-5 text-blue-500" />
                    <input
                      className="w-full bg-transparent outline-none"
                      placeholder="Quét mã vận đơn hoặc serial tại đây"
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">Dùng đầu đọc POS để nạp mã vào ô này.</p>
                  <Button type="submit" size="sm" loading={captureBusy}>
                    Gửi mã
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
            <CardTitle>Nhập mã đơn</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleManualOrder}>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Nhập mã đơn"
                  value={manualOrderCode}
                  onChange={(e) => setManualOrderCode(e.target.value)}
                />
                <Button type="submit" size="sm" loading={captureBusy}>
                  Lấy đơn
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
            <CardTitle>Thông tin đơn hàng</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {orderInfo ? (
                <>
                  <div><b>Mã đơn:</b> {orderInfo.order_code || currentOrderCode || '-'}</div>
                  <div><b>Trạng thái:</b> {orderInfo.shipping_status || '-'}</div>
                  {orderInfo.shop_id ? <div><b>Shop ID:</b> {orderInfo.shop_id}</div> : null}
                  {Array.isArray(orderInfo.items) && orderInfo.items.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {orderInfo.items.map((item, index) => (
                        <li key={`${item.name || 'item'}-${index}`}>
                          {(item.qty || 0)} x {item.name || 'Sản phẩm'}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="text-slate-500">Nhập mã đơn hoặc quét mã để chuẩn bị phiên quay.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2">
                  <Truck className="h-5 w-5 text-emerald-600" />
                  Quay video
                </CardTitle>
                <div className="text-sm font-medium text-slate-500">
                  {isRecording ? 'Đang ghi hình' : 'Sẵn sàng ghi hình'}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-emerald-50 p-4">
                <div className="mb-3 flex items-center gap-3">
                  <Package2 className="h-5 w-5 text-emerald-700" />
                  <span className="font-medium text-emerald-900">Loại hàng</span>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={captureBusy || isRecording}
                    onClick={() => handleRecordingFlow('outbound')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      recordingFlow === 'outbound' ? 'bg-emerald-600 text-white' : 'border bg-white text-emerald-700'
                    }`}
                  >
                    Hàng gửi
                  </button>
                  <button
                    type="button"
                    disabled={captureBusy || isRecording}
                    onClick={() => handleRecordingFlow('return')}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                      recordingFlow === 'return' ? 'bg-amber-500 text-white' : 'border bg-white text-amber-700'
                    }`}
                  >
                    Hàng hoàn
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  Video lưu theo flow: <code>{recordingFlow === 'return' ? 'hang_hoan' : 'hang_gui'}</code>
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-500">
                    <Clock3 className="h-4 w-4" />
                    Trạng thái ghi hình
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={isRecording ? 'danger' : 'success'}>
                      {isRecording ? 'Recording' : 'Idle'}
                    </Badge>
                  </div>
                  <div className="font-mono text-3xl font-bold text-slate-800">
                    {formatSeconds(runtimeStatus?.recording_seconds || 0)}
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="mb-3 text-sm font-medium text-slate-500">Điều khiển nhanh</div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="success" size="sm" loading={captureBusy || browserUploadBusy} onClick={handleStartRecording}>
                      <Play className="mr-2 h-4 w-4" />
                      Bắt đầu quay
                    </Button>
                    <Button variant="outline" size="sm" loading={captureBusy || browserUploadBusy} onClick={() => runAction(() => captureApi.pauseRecording(), 'Đã tạm dừng quay')}>
                      <Pause className="mr-2 h-4 w-4" />
                      Tạm dừng
                    </Button>
                    <Button variant="outline" size="sm" loading={captureBusy || browserUploadBusy} onClick={() => runAction(() => captureApi.resumeRecording(), 'Đã tiếp tục quay')}>
                      <Play className="mr-2 h-4 w-4" />
                      Tiếp tục
                    </Button>
                    <Button variant="danger" size="sm" loading={captureBusy || browserUploadBusy} onClick={handleStopRecording}>
                      <Square className="mr-2 h-4 w-4" />
                      Kết thúc
                    </Button>
                    <Button variant="danger" size="sm" loading={captureBusy || browserUploadBusy} onClick={() => runAction(() => captureApi.cancelRecording(), 'Đã hủy phiên quay')}>
                      Hủy quay
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Button variant="outline" loading={captureBusy} onClick={handleStartCamera}>
                  Start Camera
                </Button>
                <Button variant="outline" loading={captureBusy} onClick={handleStopCamera}>
                  Stop Camera
                </Button>
                <Button variant="outline" loading={captureBusy} onClick={() => runAction(() => captureApi.resetOrder(), 'Da reset ma hien tai')}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset mã
                </Button>
                <Button variant="secondary" loading={captureBusy || browserUploadBusy} onClick={refreshAll}>
                  Làm mới
                </Button>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3 text-sm font-medium text-slate-700">Trạng thái đóng gói</div>
                {packingItems.length > 0 ? (
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 text-left">Sản phẩm</th>
                          <th className="px-3 py-2 text-right">SL yêu cầu</th>
                          <th className="px-3 py-2 text-right">SL đã quét</th>
                          <th className="px-3 py-2 text-center">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packingItems.map((item, index) => (
                          <tr key={`${item.key || 'item'}-${index}`} className="border-t">
                            <td className="px-3 py-2">Tổng tất cả sản phẩm</td>
                            <td className="px-3 py-2 text-right">{item.required_qty || 0}</td>
                            <td className="px-3 py-2 text-right">{item.scanned_count || 0}</td>
                            <td className="px-3 py-2 text-center">
                              <Badge variant={item.status === 'ok' ? 'success' : item.status === 'excess' ? 'danger' : 'warning'}>
                                {item.status === 'ok' ? 'Đủ' : item.status === 'excess' ? 'Thừa' : 'Thiếu'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Chưa có dữ liệu đóng gói cho đơn hiện tại.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-cyan-600" />
                Dung luong video local
              </CardTitle>
            </CardHeader>
            <CardContent>
              {storage ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{formatStorage(Number(storage.used_bytes || 0))}</p>
                    <p className="text-sm text-slate-500">
                      / {storage.storage_limit_gb ? `${Number(storage.storage_limit_gb).toFixed(0)} GB` : '90 GB'}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    {storage.video_count || 0} video • {(storage.total_duration_min || 0).toFixed?.(1) ?? storage.total_duration_min} phut
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full ${
                        storage.percent_used >= 90 ? 'bg-red-500' : storage.percent_used >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, Number(storage.percent_used || 0))}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Đang tải...</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Hàng đợi upload</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="text-slate-500">
                {uploadStatus?.processing ? 'Đang xử lý queue nền' : 'Queue đang rảnh'}
              </div>
              {uploadStatus?.queue?.length ? (
                <div className="space-y-2">
                  {uploadStatus.queue.slice(0, 5).map((job) => (
                    <div key={job.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-slate-800">{job.tracking_code}</div>
                        <Badge variant={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}>
                          {job.status}
                        </Badge>
                      </div>
                      {job.error ? <div className="mt-1 text-red-600">{job.error}</div> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500">Chưa có job upload nền.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
