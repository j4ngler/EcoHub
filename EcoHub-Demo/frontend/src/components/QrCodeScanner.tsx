import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff } from 'lucide-react';
import Button from '@/components/ui/Button';

interface QrCodeScannerProps {
  onScan: (text: string) => void;
}

export default function QrCodeScanner({ onScan }: QrCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ text: string; at: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setRunning(false);
    setStatus('');
  };

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Trình duyệt không hỗ trợ truy cập camera.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setRunning(true);
      setStatus('Đang quét QR, đưa mã vào giữa khung hình...');
    } catch {
      setStatus('Không mở được camera. Hãy cho phép quyền truy cập camera trên trình duyệt.');
    }
  };

  useEffect(() => {
    if (!running) return undefined;
    let stopped = false;

    const timer = window.setInterval(() => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth) return;

      const canvas = canvasRef.current || document.createElement('canvas');
      canvasRef.current = canvas;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qr = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (qr?.data) {
          const now = Date.now();
          if (lastScanRef.current?.text === qr.data && now - lastScanRef.current.at < 3000) return;
          lastScanRef.current = { text: qr.data, at: now };
          setStatus(`Đã quét được mã: ${qr.data}`);
          onScan(qr.data);
        }
      } catch {
        // Bỏ qua lỗi decode ở 1 khung hình, thử lại ở khung tiếp theo.
      }
    }, 500);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [running, onScan]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-slate-950">
        <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
      </div>
      {status ? <p className="text-sm text-gray-500">{status}</p> : null}
      <div className="flex gap-2">
        {!running ? (
          <Button type="button" variant="outline" onClick={start}>
            <Camera className="mr-2 h-4 w-4" />
            Bật camera quét QR
          </Button>
        ) : (
          <Button type="button" variant="danger" onClick={stop}>
            <CameraOff className="mr-2 h-4 w-4" />
            Tắt camera
          </Button>
        )}
      </div>
    </div>
  );
}
