import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Search, Upload, Filter, Eye, Trash2, HardDrive, Clock, CheckCircle, GitCompare } from 'lucide-react';
import { videosApi, VideoQueryParams } from '@/api/videos.api';
import { getErrorMessage } from '@/api/axios';
import { formatDateTime } from '@/utils/format';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';

export default function VideosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<VideoQueryParams>({
    page: 1,
    limit: 12,
    search: '',
    status: '',
    showDeleted: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['videos', filters],
    queryFn: () => videosApi.getVideos(filters),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosApi.deleteVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast.success('Đã xóa video');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const approveMutation = useMutation({
    mutationFn: (id: string) => videosApi.approveVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast.success('Đã phê duyệt video');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
  const [compareVideoId, setCompareVideoId] = useState<string | null>(null);
  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ['videos', 'compare', compareVideoId],
    queryFn: () => (compareVideoId ? videosApi.compareVideos(compareVideoId) : Promise.resolve(null)),
    enabled: !!compareVideoId,
  });
  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc muốn xóa video này?')) deleteMutation.mutate(id);
  };

  const statusOptions = [
    { value: '', label: 'Tất cả trạng thái' },
    { value: 'uploaded', label: 'Đã upload' },
    { value: 'processing', label: 'Đang xử lý' },
    { value: 'completed', label: 'Hoàn thành' },
    { value: 'failed', label: 'Thất bại' },
  ];


  const videos = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Video đóng gói</h1>
          <p className="mt-1 text-gray-500">Quản lý video đóng gói có mã vận đơn</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/videos/create')}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 transition-colors"
        >
          <Upload className="h-5 w-5" />
          Tạo video mới
        </button>
      </div>

      {/* Filters - EcoVision style */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Tìm theo mã vận đơn, mã đơn hàng..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="text-gray-500 h-5 w-5" />
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showDeleted || false}
                onChange={(e) => {
                  setFilters({ ...filters, showDeleted: e.target.checked, page: 1 });
                }}
                className="h-4 w-4 text-emerald-600 focus:ring-emerald-500 border-gray-300 rounded"
              />
              <span className="text-sm text-gray-700">Hiển thị video đã xóa</span>
            </label>
          </div>
        </div>
      </div>

      {/* Danh sách video dạng bảng giống kho hàng */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600" />
        </div>
      ) : videos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <Video className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900">Chưa có video</h3>
          <p className="mt-1 text-gray-500">
            {filters.search || filters.status
              ? 'Không có video phù hợp bộ lọc.'
              : 'Tạo video đóng gói đầu tiên từ đơn hàng.'}
          </p>
          {!filters.search && !filters.status && (
            <button
              type="button"
              onClick={() => navigate('/videos/create')}
              className="mt-6 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              Tạo video mới
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Video / Đơn hàng
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mã vận đơn
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Trạng thái xử lý
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dung lượng
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian tạo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian xóa
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {videos.map((video) => {
                const order = video.order;
                const statusLabelMap: Record<string, string> = {
                  uploaded: 'Đã upload',
                  processing: 'Đang xử lý',
                  completed: 'Hoàn thành',
                  failed: 'Thất bại',
                };
                const statusColorMap: Record<string, string> = {
                  uploaded: 'bg-yellow-100 text-yellow-800',
                  processing: 'bg-blue-100 text-blue-800',
                  completed: 'bg-green-100 text-green-800',
                  failed: 'bg-red-100 text-red-800',
                };
                const statusText = statusLabelMap[video.processingStatus] || video.processingStatus;
                const statusColor =
                  statusColorMap[video.processingStatus] || 'bg-gray-100 text-gray-800';

                return (
                  <tr key={video.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                          <Video className="h-5 w-5 text-white" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {order?.orderCode || video.trackingCode}
                          </div>
                          {order?.customerName && (
                            <div className="text-sm text-gray-500 line-clamp-1">
                              {order.customerName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-mono">
                      {video.trackingCode}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColor}`}
                      >
                        {statusText}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const originalSize = Number(video.originalVideoSize || 0);
                        const processedSize = Number(video.processedVideoSize || 0);
                        const totalSize = originalSize + processedSize;
                        if (totalSize === 0) return '-';
                        const sizeMB = totalSize / (1024 * 1024);
                        return (
                          <div className="flex items-center gap-1">
                            <HardDrive className="h-4 w-4 text-gray-400" />
                            <span>{sizeMB.toFixed(2)} MB</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDateTime(video.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {video.deletedAt ? (
                        <div className="flex items-center gap-1 text-red-600">
                          <Clock className="h-4 w-4" />
                          <span>{formatDateTime(video.deletedAt)}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/orders/${order?.id || (video as any).orderId || video.id}`)
                          }
                          className="text-emerald-600 hover:text-emerald-900"
                          title="Xem đơn hàng"
                        >
                          <Eye className="h-5 w-5" />
                        </button>
                        {!video.deletedAt && (
                          <>
                            {!video.approvedAt && (video.processingStatus === 'completed' || video.processingStatus === 'uploaded') && (
                              <button
                                type="button"
                                onClick={() => approveMutation.mutate(video.id)}
                                disabled={approveMutation.isPending}
                                className="text-green-600 hover:text-green-900"
                                title="Phê duyệt video"
                              >
                                <CheckCircle className="h-5 w-5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setCompareVideoId(video.id)}
                              className="text-blue-600 hover:text-blue-900"
                              title="So sánh video đóng gói / nhận hàng"
                            >
                              <GitCompare className="h-5 w-5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(video.id)}
                              className="text-red-600 hover:text-red-900"
                              title="Xóa video"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={meta.page === 1}
            onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) - 1 })}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-sm text-gray-500">
            Trang {meta.page} / {meta.totalPages}
          </span>
          <button
            type="button"
            disabled={meta.page === meta.totalPages}
            onClick={() => setFilters({ ...filters, page: (filters.page ?? 1) + 1 })}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}

      {/* Modal so sánh video đóng gói vs nhận hàng */}
      <Modal
        open={!!compareVideoId}
        onClose={() => setCompareVideoId(null)}
        title="So sánh video đóng gói / nhận hàng"
        size="lg"
      >
        {compareLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
          </div>
        ) : compareData ? (
          <div className="space-y-4">
            {compareData.order && (
              <p className="text-sm text-gray-600">
                Đơn: <strong>{compareData.order.orderCode}</strong> — {compareData.order.customerName}
              </p>
            )}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Video đóng gói ({compareData.packageVideo.trackingCode})</p>
              <div className="rounded-lg overflow-hidden bg-gray-100">
                {compareData.packageVideo.videoUrl ? (
                  <video
                    src={compareData.packageVideo.videoUrl}
                    controls
                    className="w-full max-h-64"
                  />
                ) : (
                  <p className="p-4 text-gray-500">Không có video</p>
                )}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Video nhận hàng ({compareData.receivingVideos?.length ?? 0})</p>
              {compareData.receivingVideos?.length ? (
                <div className="space-y-2">
                  {compareData.receivingVideos.map((rv: { id: string; videoUrl: string; customer?: { fullName: string }; recordedAt?: string }) => (
                    <div key={rv.id} className="rounded-lg overflow-hidden bg-gray-100 p-2">
                      {rv.videoUrl ? (
                        <video src={rv.videoUrl} controls className="w-full max-h-48" />
                      ) : (
                        <p className="p-2 text-gray-500">Không có video</p>
                      )}
                      {rv.customer && <p className="text-xs text-gray-500 mt-1">{rv.customer.fullName}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Chưa có video nhận hàng nào.</p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCompareVideoId(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
