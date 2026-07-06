import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle, Clock, Package, ScanLine, Search, Truck, Upload, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import { videosApi } from '@/api/videos.api';
import { getErrorMessage } from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import QrCodeScanner from '@/components/QrCodeScanner';
import { formatDateTime } from '@/utils/format';

type SearchMode = 'manual' | 'scan';

export default function TrackingPage() {
  const { trackingCode: urlTrackingCode } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchCode, setSearchCode] = useState(urlTrackingCode || '');
  const [trackingCode, setTrackingCode] = useState(urlTrackingCode || '');
  const [searchMode, setSearchMode] = useState<SearchMode>('manual');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [complaintNote, setComplaintNote] = useState('');
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['publicTracking', trackingCode],
    queryFn: () => videosApi.getPublicTrackingDetail(trackingCode),
    enabled: !!trackingCode,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!recordedBlob || !trackingCode) throw new Error('Chưa có video mở hàng để upload');
      const formData = new FormData();
      formData.append('video', recordedBlob, `receiving-${trackingCode}.webm`);
      if (complaintNote.trim()) {
        formData.append('note', complaintNote.trim());
      }
      return videosApi.uploadPublicReceivingVideo(trackingCode, formData);
    },
    onSuccess: () => {
      toast.success('Đã upload video mở hàng');
      setRecordedBlob(null);
      setComplaintNote('');
      queryClient.invalidateQueries({ queryKey: ['publicTracking', trackingCode] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  useEffect(() => {
    if (previewRef.current && cameraStream) {
      previewRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const code = searchCode.trim();
    if (!code) return;
    setTrackingCode(code);
    navigate(`/tracking/${code}`);
  };

  const handleScannedCode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setSearchCode(trimmed);
    setTrackingCode(trimmed);
    navigate(`/tracking/${trimmed}`);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      setCameraStream(stream);
    } catch (err) {
      toast.error('Không mở được camera. Hãy kiểm tra quyền camera/microphone trên trình duyệt.');
    }
  };

  const startRecording = async () => {
    let stream = cameraStream;
    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: true,
      });
      setCameraStream(stream);
    }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
      ? 'video/webm;codecs=vp8,opus'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      setRecordedBlob(new Blob(chunksRef.current, { type: 'video/webm' }));
      setIsRecording(false);
    };
    recorder.start(1000);
    setRecordedBlob(null);
    setIsRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const statusConfig = data?.order ? ORDER_STATUS_BADGES[data.order.status] : null;
  const firstPackageVideo = data?.packageVideos?.[0];
  const recordedSizeMb = recordedBlob ? (recordedBlob.size / 1024 / 1024).toFixed(1) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-100">
      <div className="border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">EcoHub Tracking</h1>
            <p className="text-sm text-gray-500">Xem video đóng gói và quay video mở hàng</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={searchMode === 'manual' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSearchMode('manual')}
              >
                <Search className="mr-2 h-4 w-4" />
                Nhập mã
              </Button>
              <Button
                type="button"
                variant={searchMode === 'scan' ? 'primary' : 'outline'}
                size="sm"
                onClick={() => setSearchMode('scan')}
              >
                <ScanLine className="mr-2 h-4 w-4" />
                Quét QR bằng camera
              </Button>
            </div>

            {searchMode === 'manual' ? (
              <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    placeholder="Nhập mã vận đơn hoặc mã đơn hàng"
                    className="input pl-10"
                  />
                </div>
                <Button type="submit">Tra cứu</Button>
              </form>
            ) : (
              <QrCodeScanner onScan={handleScannedCode} />
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-gray-500">Đang tải thông tin đơn hàng...</CardContent>
          </Card>
        ) : null}

        {error && trackingCode ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="mx-auto mb-3 h-12 w-12 text-gray-300" />
              <p className="font-medium text-gray-700">Không tìm thấy đơn hàng với mã này</p>
              <p className="mt-1 text-sm text-gray-500">Vui lòng kiểm tra lại mã trên QR hoặc mã vận đơn.</p>
            </CardContent>
          </Card>
        ) : null}

        {data ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Thông tin đơn hàng
                    </CardTitle>
                    <Badge variant={statusConfig?.variant || 'default'}>
                      {statusConfig?.label || data.order.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Info label="Mã đơn" value={data.order.orderCode} />
                    <Info label="Mã vận đơn" value={data.order.trackingCode || '-'} mono />
                    <Info label="Người nhận" value={data.order.customerName} />
                    <Info label="Đơn vị vận chuyển" value={data.order.carrier?.name || '-'} />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-gray-500">Sản phẩm</p>
                    <div className="space-y-2">
                      {data.order.items.map((item, index) => (
                        <div key={`${item.productName}-${index}`} className="rounded-lg border bg-gray-50 p-3">
                          <p className="font-medium text-gray-900">{item.productName}</p>
                          <p className="text-sm text-gray-500">
                            SKU: {item.productSku || '-'} · Số lượng: {item.quantity}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="h-5 w-5" />
                    Video đóng gói
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {firstPackageVideo ? (
                    <div className="space-y-3">
                      <video
                        src={firstPackageVideo.videoUrl}
                        controls
                        playsInline
                        className="aspect-video w-full rounded-xl bg-black"
                      />
                      <p className="text-sm text-gray-500">
                        Quay lúc: {formatDateTime(firstPackageVideo.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed p-8 text-center text-gray-500">
                      Chưa có video đóng gói cho đơn này.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5" />
                    Quay video mở hàng
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <video ref={previewRef} autoPlay muted playsInline className="aspect-video w-full rounded-xl bg-black" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={startCamera} disabled={isRecording}>
                      Bật camera
                    </Button>
                    {!isRecording ? (
                      <Button type="button" onClick={startRecording}>
                        Bắt đầu quay
                      </Button>
                    ) : (
                      <Button type="button" variant="danger" onClick={stopRecording}>
                        Kết thúc quay
                      </Button>
                    )}
                  </div>
                  {recordedBlob ? (
                    <div className="rounded-xl border bg-emerald-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-emerald-700">
                        <CheckCircle className="h-5 w-5" />
                        <span className="font-medium">Đã ghi video mở hàng ({recordedSizeMb} MB)</span>
                      </div>
                      <textarea
                        value={complaintNote}
                        onChange={(e) => setComplaintNote(e.target.value)}
                        placeholder="Ghi chú khiếu nại nếu có"
                        className="input min-h-[88px]"
                      />
                      <Button
                        type="button"
                        className="mt-3"
                        onClick={() => uploadMutation.mutate()}
                        disabled={uploadMutation.isPending}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload video mở hàng
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Trạng thái gửi/hoàn
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <TimelineItem label="Tạo đơn" value={data.order.createdAt} active />
                  <TimelineItem label="Đóng gói" value={data.order.packedAt} />
                  <TimelineItem label="Đã gửi hàng" value={data.order.shippedAt} />
                  <TimelineItem label="Đã giao hàng" value={data.order.deliveredAt} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Video mở hàng đã gửi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {data.receivingVideos.length === 0 ? (
                    <p className="text-sm text-gray-500">Chưa có video mở hàng.</p>
                  ) : (
                    data.receivingVideos.map((video) => (
                      <div key={video.id} className="rounded-lg border p-3">
                        <video src={video.videoUrl} controls playsInline className="mb-2 aspect-video w-full rounded bg-black" />
                        <p className="text-xs text-gray-500">
                          Gửi lúc: {formatDateTime(video.recordedAt || video.createdAt)}
                        </p>
                        {video.comparisonNotes ? (
                          <p className="mt-1 text-sm text-gray-700">Ghi chú: {video.comparisonNotes}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function TimelineItem({ label, value, active }: { label: string; value?: string | null; active?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`mt-1 h-3 w-3 rounded-full ${value || active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-gray-500">{value ? formatDateTime(value) : 'Chưa có dữ liệu'}</p>
      </div>
    </div>
  );
}
