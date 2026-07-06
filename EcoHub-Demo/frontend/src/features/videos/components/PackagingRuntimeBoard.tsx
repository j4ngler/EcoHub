import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Clock3, HardDrive, Package2, Pause, Play, RotateCcw, ScanLine, Square, Truck, UploadCloud } from 'lucide-react';
import jsQR from 'jsqr';
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

type DetectedBarcode = {
  rawValue?: string;
};

type BarcodeDetectorInstance = {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

type QrBox = {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  text: string;
};

type ScanResult = {
  ok?: boolean;
  action?: 'order-selected' | 'order-missing' | 'order-confirmed' | 'duplicate-serial' | 'serial-scanned';
  current_order_code?: string | null;
  order_info?: {
    order_id?: string;
    order_code?: string;
    tracking_code?: string;
  } | null;
  message?: string;
};

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorInstance;
  }
}

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

// Phải khớp với multer fileFilter + limits ở backend (upload.middleware.ts)
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

const selectVideoDeviceId = async (cameraIndex: number) => {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoInputs = devices.filter((device) => device.kind === 'videoinput');
  return videoInputs[cameraIndex]?.deviceId || videoInputs[0]?.deviceId || null;
};

const drawQrOverlay = (
  canvas: HTMLCanvasElement,
  sourceVideo: HTMLVideoElement,
  box: QrBox | null
) => {
  const displayWidth = sourceVideo.clientWidth;
  const displayHeight = sourceVideo.clientHeight;
  canvas.width = displayWidth;
  canvas.height = displayHeight;

  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!box || !sourceVideo.videoWidth || !sourceVideo.videoHeight) return;

  const scaleX = displayWidth / sourceVideo.videoWidth;
  const scaleY = displayHeight / sourceVideo.videoHeight;
  const toCanvas = (point: { x: number; y: number }) => ({
    x: point.x * scaleX,
    y: point.y * scaleY,
  });

  const topLeft = toCanvas(box.topLeft);
  const topRight = toCanvas(box.topRight);
  const bottomRight = toCanvas(box.bottomRight);
  const bottomLeft = toCanvas(box.bottomLeft);

  context.lineWidth = 4;
  context.strokeStyle = '#22c55e';
  context.fillStyle = 'rgba(34, 197, 94, 0.14)';
  context.beginPath();
  context.moveTo(topLeft.x, topLeft.y);
  context.lineTo(topRight.x, topRight.y);
  context.lineTo(bottomRight.x, bottomRight.y);
  context.lineTo(bottomLeft.x, bottomLeft.y);
  context.closePath();
  context.fill();
  context.stroke();

  context.font = '600 14px sans-serif';
  context.fillStyle = '#22c55e';
  context.fillText(box.text.slice(0, 42), topLeft.x, Math.max(18, topLeft.y - 8));
};

export default function PackagingRuntimeBoard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [scanCode, setScanCode] = useState('');
  const [lastScannedCode, setLastScannedCode] = useState('');
  const [manualOrderCode, setManualOrderCode] = useState('');
  const [manualSerialCode, setManualSerialCode] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [recordingFlow, setRecordingFlow] = useState<'outbound' | 'return'>('outbound');
  const [clock, setClock] = useState(() => new Date());
  const [browserCameraRunning, setBrowserCameraRunning] = useState(() => isBrowserCameraRunning());
  const [browserRecording, setBrowserRecording] = useState(false);
  const [browserUploadBusy, setBrowserUploadBusy] = useState(false);
  const [manualUploadBusy, setManualUploadBusy] = useState(false);
  const [cameraScannerEnabled, setCameraScannerEnabled] = useState(true);
  const [cameraScannerStatus, setCameraScannerStatus] = useState('Trình quét QR đang chờ');
  const [qrBox, setQrBox] = useState<QrBox | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerBusyRef = useRef(false);
  const serialAutoSubmitTimerRef = useRef<number | null>(null);
  const serialSubmitInFlightRef = useRef(false);
  const cancelBrowserRecordingRef = useRef(false);
  const recordingFlowRef = useRef<'outbound' | 'return'>('outbound');
  const lastCameraScanRef = useRef<{ code: string; at: number } | null>(null);
  const visibleCameraCodeRef = useRef<string | null>(null);
  const isRecordingRef = useRef(false);
  const lastSpokenOrderRef = useRef<string | null>(null);

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
    if (!runtimeStatus?.recording_flow) return;
    const nextFlow = runtimeStatus.recording_flow === 'return' ? 'return' : 'outbound';
    recordingFlowRef.current = nextFlow;
    setRecordingFlow(nextFlow);
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

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const timer = window.setTimeout(() => scanInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [currentOrderCode, isRecording, captureBusy]);

  const speakOrderInfo = (code: string, order: NonNullable<typeof orderInfo>) => {
    if (!('speechSynthesis' in window)) return;

    const items = order.items || [];
    const totalQty = items.reduce((sum, item) => sum + Math.max(1, Number(item.qty || 1)), 0);

    const speechParts = [
      `Đã nhận đơn ${code}.`,
      totalQty > 0 ? `Đơn hàng có ${totalQty} sản phẩm.` : 'Đơn hàng chưa có chi tiết sản phẩm.',
    ].filter(Boolean);

    const speakVietnamese = (attempt = 0) => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length && attempt < 10) {
        window.setTimeout(() => speakVietnamese(attempt + 1), 150);
        return;
      }

      const vietnameseVoices = voices.filter(
        (voice) =>
          voice.lang.toLowerCase().startsWith('vi') ||
          /tiếng việt|vietnamese|hoaimy|namminh/i.test(voice.name)
      );
      const vietnameseVoice =
        vietnameseVoices.find((voice) => /google|chrome/i.test(voice.name)) ||
        vietnameseVoices.find((voice) => /microsoft|hoaimy|namminh/i.test(voice.name)) ||
        vietnameseVoices[0];

      if (!vietnameseVoice) {
        toast.error('Máy này chưa có giọng đọc tiếng Việt. Hãy cài giọng Vietnamese trong Windows.');
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(speechParts.join(' '));
      utterance.lang = 'vi-VN';
      utterance.voice = vietnameseVoice;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    };

    speakVietnamese();
  };

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    if (!currentOrderCode || !orderInfo) {
      lastSpokenOrderRef.current = null;
      return;
    }

    const speechKey = `${currentOrderCode}:${orderInfo.order_id || orderInfo.order_code || ''}`;
    if (lastSpokenOrderRef.current === speechKey) return;
    lastSpokenOrderRef.current = speechKey;
    speakOrderInfo(currentOrderCode, orderInfo);
  }, [currentOrderCode, orderInfo]);

  const refreshAll = async () => {
    await Promise.all([refetchRuntimeStatus(), refetchCameraStatus(), refetchStorageUsage(), refetchUploadStatus()]);
  };

  const submitCameraScan = async (code: string) => {
    const normalized = code.trim();
    if (!normalized || scannerBusyRef.current) return;
    if (!isRecordingRef.current && visibleCameraCodeRef.current === normalized) return;

    const cooldownMs = Math.max(5, captureSettings?.qrCooldownSeconds || 5) * 1000;
    const last = lastCameraScanRef.current;
    const now = Date.now();
    if (last?.code === normalized && now - last.at < cooldownMs) return;

    scannerBusyRef.current = true;
    visibleCameraCodeRef.current = normalized;
    lastCameraScanRef.current = { code: normalized, at: now };
    setLastScannedCode(normalized);
    setCameraScannerStatus(`Đã phát hiện: ${normalized}`);

    try {
      const result = (await captureApi.manualScan(normalized)) as ScanResult;
      if (result.action === 'serial-scanned') {
        toast.success(`Đã quét serial: ${normalized}`);
        await refreshAll();
      } else if (result.action === 'duplicate-serial') {
        toast.error(result.message || 'Mã này đã được quét trong đơn hiện tại');
        await refreshAll();
      } else {
        await applyScanResult(result);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      scannerBusyRef.current = false;
    }
  };

  const ensureUploadSession = async (orderIdOverride?: string) => {
    const existing = await captureApi.getActiveSession();
    if (existing?.session) return existing.session;

    const orderId = orderIdOverride || runtimeStatus?.order_info?.order_id;
    if (!orderId) {
      throw new Error('Chưa có đơn hàng hiện tại để tạo phiên ghi hình');
    }

    const prepared = await captureApi.prepareUploadFlow({
      orderId,
      module: recordingFlowRef.current === 'return' ? 'receiving' : 'packaging',
      recordingFlow: recordingFlowRef.current,
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

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = liveVideoRef.current;
    if (!canvas || !video) return;

    drawQrOverlay(canvas, video, qrBox);
  }, [qrBox, browserCameraRunning]);

  useEffect(() => {
    if (cameraMode !== 'usb' || captureAgentAvailable || !browserCameraRunning || !cameraScannerEnabled) {
      setCameraScannerStatus('Trình quét QR đang chờ');
      setQrBox(null);
      visibleCameraCodeRef.current = null;
      return;
    }

    let stopped = false;
    const detector = window.BarcodeDetector
      ? new window.BarcodeDetector({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'],
        })
      : null;

    const scanFrame = async () => {
      if (stopped || scannerBusyRef.current) return;

      const video = liveVideoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
        setCameraScannerStatus('Đang chờ khung hình camera');
        return;
      }

      const canvas = scannerCanvasRef.current || document.createElement('canvas');
      scannerCanvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (qr?.data) {
          setQrBox({
            topLeft: qr.location.topLeftCorner,
            topRight: qr.location.topRightCorner,
            bottomRight: qr.location.bottomRightCorner,
            bottomLeft: qr.location.bottomLeftCorner,
            text: qr.data,
          });
          await submitCameraScan(qr.data);
        } else if (detector) {
          const results = await detector.detect(canvas);
          const rawValue = results.find((result) => result.rawValue)?.rawValue?.trim();
          if (rawValue) {
            setQrBox(null);
            await submitCameraScan(rawValue);
          } else {
            visibleCameraCodeRef.current = null;
            setQrBox(null);
            setCameraScannerStatus('Đang quét QR/barcode từ camera');
          }
        } else {
          visibleCameraCodeRef.current = null;
          setQrBox(null);
          setCameraScannerStatus('Đang quét QR/barcode từ camera');
        }
      } catch {
        visibleCameraCodeRef.current = null;
        setQrBox(null);
        setCameraScannerStatus('Chưa đọc được mã trong khung hình hiện tại');
      }
    };

    setCameraScannerStatus(detector ? 'Đang quét QR/barcode từ camera' : 'Đang quét QR từ camera');
    const timer = window.setInterval(scanFrame, 700);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [
    browserCameraRunning,
    cameraMode,
    cameraScannerEnabled,
    captureAgentAvailable,
    captureSettings?.qrCooldownSeconds,
  ]);

  const startBrowserCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Trình duyệt không hỗ trợ webcam API');
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

  // Upload video có sẵn từ máy cho đơn hiện tại (thay vì quay trực tiếp)
  const uploadSelectedVideo = async (file: File) => {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error('Video vượt quá 100MB. Vui lòng chọn file nhỏ hơn.');
    }
    if (file.type && !ALLOWED_VIDEO_MIME.includes(file.type)) {
      throw new Error('Định dạng không hợp lệ. Chỉ chấp nhận MP4, WebM, MOV hoặc AVI.');
    }

    const session = await ensureUploadSession();

    const formData = new FormData();
    formData.append('video', file);
    formData.append('orderId', session.orderId);
    formData.append('trackingCode', session.trackingCode);
    formData.append('trackingCodePosition', 'bottom_right');

    await videosApi.uploadVideo(formData);
    await captureApi.clearActiveSession();
    await captureApi.resetOrder();
  };

  const handlePickVideoFile = () => {
    if (!currentOrderCode) {
      toast.error('Hãy chọn/nhập mã đơn trước khi upload video.');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleVideoFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset để có thể chọn lại cùng 1 file
    if (!file) return;

    setManualUploadBusy(true);
    try {
      await uploadSelectedVideo(file);
      toast.success('Đã upload video đóng gói thành công');
      await refreshAll();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setManualUploadBusy(false);
    }
  };

  const startBrowserRecording = async (orderIdOverride?: string) => {
    let stream = getBrowserCameraStream();
    if (!browserCameraRunning || !stream) {
      await startBrowserCamera();
      stream = getBrowserCameraStream();
    }

    if (!stream) {
      throw new Error('Không mở được webcam để ghi hình');
    }

    await ensureUploadSession(orderIdOverride);
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
        if (cancelBrowserRecordingRef.current) {
          chunksRef.current = [];
          toast.success('Đã hủy phiên quay');
          return;
        }
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
        cancelBrowserRecordingRef.current = false;
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

  const cancelBrowserRecording = async () => {
    cancelBrowserRecordingRef.current = true;
    chunksRef.current = [];
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    } else {
      setBrowserRecording(false);
      cancelBrowserRecordingRef.current = false;
    }
    try {
      await captureApi.cancelRecording();
    } catch {
      try {
        await captureApi.stopRecording({ mode: 'browser' });
      } catch {
        // Browser recording is already cancelled locally; backend sync is best-effort.
      }
    }
  };

  const startRecordingForOrder = async (orderId?: string) => {
    if (isRecordingRef.current) return;

    if (cameraMode === 'usb' && !captureAgentAvailable) {
      await startBrowserRecording(orderId);
      toast.success('Đã tự động bắt đầu quay sau khi quét đơn');
      await refreshAll();
      return;
    }

    if (orderId) {
      await captureApi.prepareUploadFlow({
        orderId,
        module: recordingFlowRef.current === 'return' ? 'receiving' : 'packaging',
        recordingFlow: recordingFlowRef.current,
      });
    }
    await captureApi.startRecording();
    toast.success('Đã tự động bắt đầu quay sau khi quét đơn');
    await refreshAll();
  };

  const stopRecordingFromScan = async () => {
    if (!isRecordingRef.current) return;

    if (cameraMode === 'usb' && !captureAgentAvailable) {
      await stopBrowserRecording();
    } else {
      await captureApi.stopRecording();
    }
    toast.success('Đã quét lại mã đơn và kết thúc quay');
    await refreshAll();
  };

  const applyScanResult = async (result: ScanResult) => {
    if (result.action === 'order-missing') {
      toast.error(result.message || 'Không tìm thấy đơn hàng cho mã vừa quét');
      return;
    }

    if (result.action === 'order-selected') {
      await startRecordingForOrder(result.order_info?.order_id);
      return;
    }

    if (result.action === 'order-confirmed') {
      if (isRecordingRef.current) {
        await stopRecordingFromScan();
      } else {
        await startRecordingForOrder(result.order_info?.order_id);
      }
    }
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

  const submitScannedValue = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;
    if (serialSubmitInFlightRef.current) return;
    serialSubmitInFlightRef.current = true;
    setLastScannedCode(value);
    setScanCode('');
    try {
      await runAction(async () => {
        const result = (await captureApi.manualScan(value)) as ScanResult;
        if (result.action === 'serial-scanned') {
          toast.success(`Đã quét serial: ${value}`);
        } else if (result.action === 'duplicate-serial') {
          toast.error(result.message || 'Mã này đã được quét trong đơn hiện tại');
        } else {
          await applyScanResult(result);
        }
        scanInputRef.current?.focus();
      });
    } finally {
      serialSubmitInFlightRef.current = false;
    }
  };

  const handleManualScan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (serialAutoSubmitTimerRef.current) {
      window.clearTimeout(serialAutoSubmitTimerRef.current);
      serialAutoSubmitTimerRef.current = null;
    }
    await submitScannedValue(scanInputRef.current?.value || scanCode);
  };

  const handleManualOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = manualOrderCode.trim();
    if (!value) return;
    await runAction(async () => {
      const result = (await captureApi.manualOrder(value)) as ScanResult;
      setManualOrderCode('');
      const orderId = result.order_info?.order_id;
      if (!orderId) {
        throw new Error(result.message || `Không tìm thấy đơn hàng cho mã: ${value}`);
      }
      await startRecordingForOrder(orderId);
    }, `Đã lấy đơn: ${value}`);
  };

  const handleManualSerial = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = manualSerialCode.trim();
    if (!value) return;
    setManualSerialCode('');
    await submitScannedValue(value);
  };

  const handleRecordingFlow = async (flow: 'outbound' | 'return') => {
    recordingFlowRef.current = flow;
    setRecordingFlow(flow);
    await runAction(
      async () => captureApi.setRecordingFlow(flow),
      flow === 'return' ? 'Đã chuyển sang hàng hoàn' : 'Đã chuyển sang hàng gửi'
    );
  };

  const handleStartCamera = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      await runAction(startBrowserCamera, 'Đã mở webcam trên trình duyệt');
      return;
    }
    await runAction(() => captureApi.startCameras(), 'Đã khởi động camera');
  };

  const handleStopCamera = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      stopBrowserCamera();
      toast.success('Đã dừng webcam trên trình duyệt');
      await refreshAll();
      return;
    }
    await runAction(() => captureApi.stopCameras(), 'Đã dừng camera');
  };

  const handleStartRecording = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      setCaptureBusy(true);
      try {
        await startBrowserRecording();
        toast.success('Đã bắt đầu quay trên trình duyệt');
        await refreshAll();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCaptureBusy(false);
      }
      return;
    }

    await runAction(() => captureApi.startRecording(), 'Đã bắt đầu quay');
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

    await runAction(() => captureApi.stopRecording(), 'Đã kết thúc quay');
  };

  const handleCancelRecording = async () => {
    if (cameraMode === 'usb' && !captureAgentAvailable) {
      setCaptureBusy(true);
      try {
        await cancelBrowserRecording();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setCaptureBusy(false);
        await refreshAll();
      }
      return;
    }

    await runAction(() => captureApi.cancelRecording(), 'Đã hủy phiên quay');
  };

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2.2fr)_360px]">
        <Card className="overflow-hidden">
          <CardContent className="p-3">
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
              <div className="relative overflow-hidden rounded-xl border bg-slate-950">
                <video ref={liveVideoRef} className="aspect-video w-full object-cover" muted playsInline />
                <canvas ref={overlayCanvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
                {!browserCameraRunning ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                    <div className="text-center">
                      <Camera className="mx-auto mb-4 h-14 w-14 opacity-40" />
                      <p className="text-lg font-semibold">Webcam chưa mở</p>
                      <p className="mt-1 text-sm text-slate-400">Nhấn Bật camera để xin quyền webcam và mở preview.</p>
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
                      : 'Nhấn Bật camera để mở webcam trong trình duyệt.'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 xl:max-h-[520px] xl:overflow-y-auto xl:pr-1">
          <Card>
            <CardHeader>
              <CardTitle>Mã đơn hiện tại</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-3xl font-bold text-blue-600">{currentOrderCode || 'Chưa chọn đơn'}</p>
              <Button
                variant="outline"
                size="sm"
                loading={captureBusy}
                onClick={() => runAction(() => captureApi.resetOrder(), 'Đã reset mã hiện tại')}
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
              <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
                <div className="flex items-center justify-between gap-3">
                  <span>{cameraScannerStatus}</span>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                      cameraScannerEnabled ? 'bg-emerald-600 text-white' : 'border bg-white text-slate-600'
                    }`}
                    onClick={() => setCameraScannerEnabled((enabled) => !enabled)}
                  >
                    {cameraScannerEnabled ? 'QR ON' : 'QR OFF'}
                  </button>
                </div>
                <p className="mt-1 text-xs text-emerald-700">
                  QR/barcode từ camera sẽ tự động đẩy vào luồng scan như đầu đọc POS.
                </p>
              </div>
              <form className="space-y-3" onSubmit={handleManualScan}>
                {lastScannedCode ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Mã vừa quét: <span className="font-mono font-semibold">{lastScannedCode}</span>
                  </div>
                ) : null}
                <div className="rounded-xl border bg-slate-50 p-3">
                  <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
                    <ScanLine className="h-5 w-5 text-blue-500" />
                    <input
                      ref={scanInputRef}
                      className="w-full bg-transparent outline-none"
                      placeholder="Quét mã vận đơn hoặc serial tại đây"
                      value={scanCode}
                      autoFocus
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setScanCode(nextValue);
                        if (serialAutoSubmitTimerRef.current) {
                          window.clearTimeout(serialAutoSubmitTimerRef.current);
                        }
                        if (!nextValue.trim()) return;
                        serialAutoSubmitTimerRef.current = window.setTimeout(() => {
                          serialAutoSubmitTimerRef.current = null;
                          void submitScannedValue(scanInputRef.current?.value || nextValue);
                        }, 180);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        if (serialAutoSubmitTimerRef.current) {
                          window.clearTimeout(serialAutoSubmitTimerRef.current);
                          serialAutoSubmitTimerRef.current = null;
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => scanInputRef.current?.focus(), 120);
                      }}
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
              <CardTitle>Nhập serial test</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={handleManualSerial}>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Nhập serial để test thủ công"
                  value={manualSerialCode}
                  onChange={(e) => setManualSerialCode(e.target.value)}
                />
                <Button type="submit" size="sm" loading={captureBusy}>
                  Gửi serial
                </Button>
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
                      {isRecording ? 'Đang quay' : 'Đang chờ'}
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
                    <Button variant="danger" size="sm" loading={captureBusy || browserUploadBusy} onClick={handleCancelRecording}>
                      Hủy quay
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Button variant="outline" loading={captureBusy} onClick={handleStartCamera}>
                  Bật camera
                </Button>
                <Button variant="outline" loading={captureBusy} onClick={handleStopCamera}>
                  Tắt camera
                </Button>
                <Button variant="outline" loading={captureBusy} onClick={() => runAction(() => captureApi.resetOrder(), 'Đã reset mã hiện tại')}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset mã
                </Button>
                <Button variant="secondary" loading={captureBusy || browserUploadBusy} onClick={refreshAll}>
                  Làm mới
                </Button>
              </div>

              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-900">
                  <UploadCloud className="h-4 w-4 text-emerald-700" />
                  Upload video có sẵn lên S3
                </div>
                <p className="mb-3 text-sm text-slate-600">
                  Chọn file video từ máy cho <b>đơn hiện tại</b> ({currentOrderCode || 'chưa chọn đơn'}). Video sẽ
                  được nén và lưu lên S3 giống như khi quay trực tiếp. Hỗ trợ MP4, WebM, MOV, AVI (tối đa 100MB).
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                  className="hidden"
                  onChange={handleVideoFileSelected}
                />
                <Button
                  variant="success"
                  size="sm"
                  loading={manualUploadBusy}
                  disabled={!currentOrderCode || isRecording || captureBusy || browserUploadBusy}
                  onClick={handlePickVideoFile}
                >
                  <UploadCloud className="mr-2 h-4 w-4" />
                  Chọn video để upload
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
                            <td className="px-3 py-2">
                              {item.name || 'Sản phẩm'} {item.sku ? `(${item.sku})` : ''}
                            </td>
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
                Dung lượng video nội bộ
              </CardTitle>
            </CardHeader>
            <CardContent>
              {storage ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{formatStorage(Number(storage.used_bytes || 0))}</p>
                    <p className="text-sm text-slate-500">
                      / {storage.storage_limit_gb ? `${Number(storage.storage_limit_gb).toFixed(0)} GB` : '100 GB'}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    {storage.video_count || 0} video • {(storage.total_duration_min || 0).toFixed?.(1) ?? storage.total_duration_min} phút
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
