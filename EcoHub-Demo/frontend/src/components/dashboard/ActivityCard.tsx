import {
  Upload,
  CheckCircle,
  MessageCircle,
  Heart,
  Download,
  User,
  Package,
  Truck,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/utils/cn';

const typeMap: Record<string, { icon: LucideIcon; color: string }> = {
  upload: { icon: Upload, color: 'text-blue-500 bg-blue-100' },
  approve: { icon: CheckCircle, color: 'text-green-500 bg-green-100' },
  comment: { icon: MessageCircle, color: 'text-amber-500 bg-amber-100' },
  like: { icon: Heart, color: 'text-rose-500 bg-rose-100' },
  download: { icon: Download, color: 'text-purple-500 bg-purple-100' },
  user: { icon: User, color: 'text-cyan-500 bg-cyan-100' },
  order: { icon: Package, color: 'text-emerald-500 bg-emerald-100' },
  shipping: { icon: Truck, color: 'text-indigo-500 bg-indigo-100' },
};

interface ActivityCardProps {
  activity: {
    type: string;
    message: string;
    time: string;
    user?: string;
  };
}

export default function ActivityCard({ activity }: ActivityCardProps) {
  const { icon: Icon, color } = typeMap[activity.type] || typeMap.user;

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className={cn('flex-shrink-0 p-2 rounded-lg', color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between gap-2">
          <p className="text-sm font-medium text-gray-900">{activity.message}</p>
          <span className="text-xs text-gray-500 whitespace-nowrap">{activity.time}</span>
        </div>
        {activity.user && (
          <p className="mt-1 text-xs text-gray-500">
            Bởi: <span className="font-medium text-gray-700">{activity.user}</span>
          </p>
        )}
      </div>
    </div>
  );
}
