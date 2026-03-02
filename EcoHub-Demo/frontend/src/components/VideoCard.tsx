import React from 'react';
import {
  Play,
  Edit,
  Trash2,
  Eye,
  Heart,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

const statusMap: Record<string, { text: string; color: string; icon: typeof Clock }> = {
  approved: { text: 'Đã duyệt', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  pending: { text: 'Chờ duyệt', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  rejected: { text: 'Bị từ chối', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

interface VideoCardProps {
  video: {
    id: number | string;
    title: string;
    thumbnail: string;
    duration: string;
    views: number;
    likes: number;
    date: string;
    status: string;
    isEco?: boolean;
  };
}

export default function VideoCard({ video }: VideoCardProps) {
  const StatusIcon = statusMap[video.status]?.icon || Clock;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative">
        <img src={video.thumbnail} alt={video.title} className="w-full h-40 object-cover" />
        <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
          {video.duration}
        </div>
        {video.isEco && (
          <div className="absolute top-2 left-2 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            ECO
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-gray-900 line-clamp-1">{video.title}</h4>
          <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusMap[video.status]?.color || statusMap.pending.color}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusMap[video.status]?.text || 'Chờ duyệt'}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <Eye className="h-4 w-4 mr-1" />
              <span>{video.views.toLocaleString()}</span>
            </div>
            <div className="flex items-center">
              <Heart className="h-4 w-4 mr-1 text-rose-500" />
              <span>{video.likes}</span>
            </div>
          </div>
          <span>{video.date}</span>
        </div>

        <div className="mt-4 flex justify-end space-x-2">
          <button className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors" title="Xem">
            <Play className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" title="Chỉnh sửa">
            <Edit className="h-5 w-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Xóa">
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
