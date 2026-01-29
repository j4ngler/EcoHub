import { useNavigate } from 'react-router-dom';
import {
  Play,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  Clock,
  AlertTriangle,
  Package,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';

const statusMap: Record<string, { text: string; color: string; icon: typeof Clock }> = {
  uploaded: { text: 'Đã upload', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  processing: { text: 'Đang xử lý', color: 'bg-blue-100 text-blue-800', icon: Clock },
  completed: { text: 'Hoàn thành', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  failed: { text: 'Thất bại', color: 'bg-red-100 text-red-800', icon: AlertTriangle },
};

interface VideoCardVideo {
  id: string;
  orderId?: string;
  trackingCode: string;
  thumbnailUrl?: string | null;
  processingStatus: string;
  createdAt: string;
  order?: { id?: string; orderCode?: string; customerName?: string };
  approvedAt?: string | null;
}

interface VideoCardProps {
  video: VideoCardVideo;
  onDelete?: (id: string) => void;
  onApprove?: (id: string) => void;
  showActions?: boolean;
}

export default function VideoCard({
  video,
  onDelete,
  onApprove,
  showActions = true,
}: VideoCardProps) {
  const navigate = useNavigate();
  const cfg = statusMap[video.processingStatus] || statusMap.uploaded;
  const StatusIcon = cfg.icon;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
        <Package className="w-5 h-5 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 truncate">
              {video.order?.orderCode || video.trackingCode}
            </p>
            {video.order?.customerName && (
              <p className="text-sm text-gray-500 truncate">{video.order.customerName}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {formatDateTime(video.createdAt)}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Mã video: <span className="font-mono">{video.trackingCode}</span>
            </p>
          </div>
          <span
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shrink-0',
              cfg.color
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {cfg.text}
          </span>
        </div>

        {showActions && (
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => navigate(`/orders/${video.order?.id || video.orderId || video.id}`)}
              className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
              title="Xem đơn hàng"
            >
              <Eye className="h-5 w-5" />
            </button>
            {video.processingStatus === 'uploaded' && onApprove && (
              <button
                type="button"
                onClick={() => onApprove(video.id)}
                className="p-2 text-gray-400 hover:text-green-600 rounded-lg hover:bg-green-50 transition-colors"
                title="Phê duyệt"
              >
                <CheckCircle className="h-5 w-5" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(video.id)}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                title="Xóa"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
