import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Video, Search, Upload, Download, Eye } from 'lucide-react';
import { videosApi, type ReceivingVideo } from '@/api/videos.api';
import { ordersApi } from '@/api/orders.api';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { formatDateTime } from '@/utils/format';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';

type ComparisonFilter = 'all' | 'pending' | 'matched' | 'mismatched' | 'disputed';

const comparisonStatusMap: Record<
  Exclude<ComparisonFilter, 'all'>,
  { label: string; className: string }
> = {
  pending: { label: 'Chờ so sánh', className: 'bg-yellow-100 text-yellow-800' },
  matched: { label: 'Khớp', className: 'bg-green-100 text-green-800' },
  mismatched: { label: 'Không khớp', className: 'bg-red-100 text-red-800' },
  disputed: { label: 'Cần xử lý', className: 'bg-purple-100 text-purple-800' },
};

export default function ReceivingVideosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [comparisonFilter, setComparisonFilter] = useState<ComparisonFilter>('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<ReceivingVideo | null>(null);
  const [uploadForm, setUploadForm] = useState({
    orderId: '',
    trackingCode: '',
    file: null as File | null,
  });

  const { data: videosData, isLoading, refetch } = useQuery({
    queryKey: ['receiving-videos', searchTerm, comparisonFilter],
    queryFn: () =>
      videosApi.getReceivingVideos({
        page: 1,
        limit: 100,
        search: searchTerm || undefined,
        comparisonStatus: comparisonFilter === 'all' ? undefined : comparisonFilter,
      }),
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders-for-receiving-video'],
    queryFn: () => ordersApi.getOrders({ page: 1, limit: 100 }),
  });

  const orders = useMemo(() => ordersData?.data ?? [], [ordersData]);
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === uploadForm.orderId) ?? null,
    [orders, uploadForm.orderId]
  );

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => videosApi.uploadReceivingVideo(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-videos'] });
      toast.success('Đã upload video hoàn hàng');
      setUploadModalOpen(false);
      setUploadForm({ orderId: '', trackingCode: '', file: null });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const ensureOrderFromTracking = async () => {
    const code = uploadForm.trackingCode.trim();
    if (!code) return;

    const localMatch = orders.find((order) => order.trackingCode === code);
    if (localMatch) {
      setUploadForm((prev) => ({ ...prev, orderId: localMatch.id }));
      return;
    }

    try {
      const order = await ordersApi.getOrderByTrackingCode(code);
      setUploadForm((prev) => ({ ...prev, orderId: order.id }));
    } catch {
      // Keep form editable; user may still select the order manually.
    }
  };

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file || !uploadForm.orderId) {
      toast.error('Vui lòng chọn đơn hàng và file video');
      return;
    }

    const formData = new FormData();
    formData.append('orderId', uploadForm.orderId);
    formData.append('trackingCode', uploadForm.trackingCode.trim());
    formData.append('video', uploadForm.file);

    uploadMutation.mutate(formData);
  };

  const videos = videosData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video hoàn hàng</h1>
          <p className="mt-1 text-gray-500">Quản lý video khách hàng quay khi nhận hoặc hoàn hàng</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Làm mới
          </Button>
          <Button onClick={() => setUploadModalOpen(true)}>
            <Upload className="mr-2 h-5 w-5" />
            Upload video hoàn hàng
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm theo mã đơn hàng, mã vận đơn, khách hàng..."
                className="input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input"
              value={comparisonFilter}
              onChange={(e) => setComparisonFilter(e.target.value as ComparisonFilter)}
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chờ so sánh</option>
              <option value="matched">Khớp</option>
              <option value="mismatched">Không khớp</option>
              <option value="disputed">Cần xử lý</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-16 w-16 animate-spin rounded-full border-b-2 border-emerald-600" />
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Video className="mx-auto mb-4 h-16 w-16 text-gray-300" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">Chưa có video hoàn hàng</h3>
            <p className="mb-6 text-gray-500">Upload video đầu tiên để bắt đầu</p>
            <Button onClick={() => setUploadModalOpen(true)}>Upload video</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Đơn hàng / Mã vận đơn
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Khách hàng
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Thời gian quay
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Trạng thái so sánh
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {videos.map((video) => (
                    <tr key={video.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{video.order?.orderCode || 'N/A'}</div>
                        <div className="font-mono text-sm text-gray-500">{video.trackingCode}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {video.customer?.fullName || video.order?.customerName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDateTime(video.recordedAt || video.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            comparisonStatusMap[video.comparisonStatus].className
                          }`}
                        >
                          {comparisonStatusMap[video.comparisonStatus].label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedVideo(video);
                              setViewModalOpen(true);
                            }}
                            className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"
                            title="Xem video"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {video.videoUrl && (
                            <a
                              href={video.videoUrl}
                              download
                              className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                              title="Tải video"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            onClick={() => navigate(`/orders/${video.orderId}`)}
                            className="rounded-lg p-2 text-gray-400 hover:bg-purple-50 hover:text-purple-600"
                            title="Xem đơn hàng"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        open={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setUploadForm({ orderId: '', trackingCode: '', file: null });
        }}
        title="Upload video hoàn hàng"
        size="md"
      >
        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Đơn hàng</label>
            <select
              className="input"
              value={uploadForm.orderId}
              onChange={(e) => setUploadForm((prev) => ({ ...prev, orderId: e.target.value }))}
              required
            >
              <option value="">Chọn đơn hàng...</option>
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderCode} — {order.customerName}
                  {order.trackingCode ? ` (${order.trackingCode})` : ''}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Mã vận đơn"
            value={uploadForm.trackingCode}
            onChange={(e) => setUploadForm((prev) => ({ ...prev, trackingCode: e.target.value }))}
            onBlur={ensureOrderFromTracking}
            placeholder="Có thể nhập hoặc scan để tự tìm đơn"
            helperText="Nếu nhập mã vận đơn, hệ thống sẽ thử tự chọn đơn hàng tương ứng."
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              File video <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) =>
                setUploadForm((prev) => ({ ...prev, file: e.target.files?.[0] || null }))
              }
              className="w-full rounded-lg border border-gray-300 px-4 py-2"
              required
            />
            <p className="mt-1 text-xs text-gray-500">Chọn file video (.mp4, .mov, .avi, .webm)</p>
          </div>

          {selectedOrder && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Đơn đang chọn: <strong>{selectedOrder.orderCode}</strong> • {selectedOrder.customerName}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setUploadModalOpen(false);
                setUploadForm({ orderId: '', trackingCode: '', file: null });
              }}
            >
              Hủy
            </Button>
            <Button type="submit" loading={uploadMutation.isPending}>
              Upload
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setSelectedVideo(null);
        }}
        title={selectedVideo ? `Video - ${selectedVideo.trackingCode}` : 'Xem video'}
        size="xl"
      >
        {selectedVideo?.videoUrl ? (
          <div className="space-y-4">
            <video src={selectedVideo.videoUrl} controls className="max-h-[70vh] w-full rounded-lg bg-black" />
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
              <span className="font-mono">{selectedVideo.videoUrl}</span>
              <a
                href={selectedVideo.videoUrl}
                download
                className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
              >
                <Download className="mr-2 h-4 w-4" />
                Tải video
              </a>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Video này chưa có đường dẫn phát.</div>
        )}
      </Modal>
    </div>
  );
}
