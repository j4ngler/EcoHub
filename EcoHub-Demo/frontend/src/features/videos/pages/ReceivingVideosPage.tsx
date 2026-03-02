import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Video, Search, Upload, Download, Eye, Trash2 } from 'lucide-react';
import { videosApi } from '@/api/videos.api';
import { ordersApi } from '@/api/orders.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { formatDateTime } from '@/utils/format';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';

export default function ReceivingVideosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [uploadForm, setUploadForm] = useState({
    orderId: '',
    trackingCode: '',
    file: null as File | null,
  });

  const { data: videosData, isLoading } = useQuery({
    queryKey: ['receiving-videos', searchTerm],
    queryFn: async () => {
      // Demo: Giả sử có API endpoint này
      // Trong thực tế, bạn cần tạo API endpoint GET /api/videos/receiving
      return { data: [], meta: { total: 0 } };
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Demo: Giả sử có API endpoint này
      // Trong thực tế, bạn cần tạo API endpoint POST /api/videos/receiving/upload
      return { id: 'demo', ...uploadForm };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receiving-videos'] });
      toast.success('Đã upload video hoàn hàng');
      setUploadModalOpen(false);
      setUploadForm({ orderId: '', trackingCode: '', file: null });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file || !uploadForm.orderId) {
      toast.error('Vui lòng chọn đơn hàng và file video');
      return;
    }

    const formData = new FormData();
    formData.append('orderId', uploadForm.orderId);
    formData.append('trackingCode', uploadForm.trackingCode || '');
    formData.append('file', uploadForm.file);

    uploadMutation.mutate(formData);
  };

  const videos = videosData?.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video hoàn hàng</h1>
          <p className="mt-1 text-gray-500">Quản lý video khách hàng quay khi nhận/hoàn hàng</p>
        </div>
        <Button onClick={() => setUploadModalOpen(true)}>
          <Upload className="h-5 w-5 mr-2" />
          Upload video hoàn hàng
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm theo mã đơn hàng, mã vận đơn..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Videos list */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600" />
        </div>
      ) : videos.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Video className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Chưa có video hoàn hàng</h3>
            <p className="text-gray-500 mb-6">Upload video đầu tiên để bắt đầu</p>
            <Button onClick={() => setUploadModalOpen(true)}>Upload video</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Đơn hàng / Mã vận đơn
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Khách hàng
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Thời gian quay
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Trạng thái so sánh
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {videos.map((video: any) => (
                    <tr key={video.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{video.order?.orderCode || 'N/A'}</div>
                        <div className="text-sm text-gray-500 font-mono">{video.trackingCode}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {video.customer?.fullName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {video.recordedAt ? formatDateTime(video.recordedAt) : formatDateTime(video.createdAt)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            video.comparisonStatus === 'matched'
                              ? 'bg-green-100 text-green-800'
                              : video.comparisonStatus === 'mismatched'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {video.comparisonStatus === 'matched'
                            ? 'Khớp'
                            : video.comparisonStatus === 'mismatched'
                            ? 'Không khớp'
                            : 'Chờ so sánh'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedVideo(video);
                              setViewModalOpen(true);
                            }}
                            className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50"
                            title="Xem video"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {video.videoUrl && (
                            <a
                              href={video.videoUrl}
                              download
                              className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50"
                              title="Tải video"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          )}
                          <button
                            onClick={() => navigate(`/orders/${video.orderId}`)}
                            className="p-2 text-gray-400 hover:text-purple-600 rounded-lg hover:bg-purple-50"
                            title="Xem đơn hàng"
                          >
                            <Eye className="w-4 h-4" />
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

      {/* Upload Modal */}
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
          <Input
            label="Mã đơn hàng"
            value={uploadForm.orderId}
            onChange={(e) => setUploadForm({ ...uploadForm, orderId: e.target.value })}
            required
            placeholder="Nhập mã đơn hàng"
          />
          <Input
            label="Mã vận đơn (tùy chọn)"
            value={uploadForm.trackingCode}
            onChange={(e) => setUploadForm({ ...uploadForm, trackingCode: e.target.value })}
            placeholder="Nhập mã vận đơn"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File video <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) =>
                setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
            <p className="mt-1 text-xs text-gray-500">Chọn file video (.mp4, .mov, ...)</p>
          </div>
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

      {/* View Video Modal */}
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
            <p className="text-sm text-gray-600 break-all">
              Đường dẫn file: <span className="font-mono">{selectedVideo.videoUrl}</span>
            </p>
            <a
              href={selectedVideo.videoUrl}
              download
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4 mr-2" />
              Tải video (.mp4)
            </a>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Video này chưa có đường dẫn.</div>
        )}
      </Modal>
    </div>
  );
}
