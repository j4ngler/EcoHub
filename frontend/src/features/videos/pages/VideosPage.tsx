import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Video, Search, Upload, Filter, Clock } from 'lucide-react';
import { videosApi, VideoQueryParams } from '@/api/videos.api';
import VideoCard from '@/components/dashboard/VideoCard';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';

export default function VideosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<VideoQueryParams>({
    page: 1,
    limit: 12,
    search: '',
    status: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['videos', filters],
    queryFn: () => videosApi.getVideos(filters),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => videosApi.approveVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast.success('Đã phê duyệt video');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => videosApi.deleteVideo(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      toast.success('Đã xóa video');
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleApprove = (id: string) => {
    if (window.confirm('Phê duyệt video này?')) approveMutation.mutate(id);
  };

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
          </div>
        </div>
      </div>

      {/* Video grid - VideoCard */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-72 bg-gray-200 rounded-xl animate-pulse" />
          ))}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {videos.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onApprove={handleApprove}
              onDelete={handleDelete}
              showActions
            />
          ))}
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
    </div>
  );
}
