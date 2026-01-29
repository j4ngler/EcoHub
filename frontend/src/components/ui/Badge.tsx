import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/utils/cn';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      danger: 'bg-red-100 text-red-800',
      info: 'bg-blue-100 text-blue-800',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;

// Order status badges
export const ORDER_STATUS_BADGES: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  pending: { label: 'Chờ xử lý', variant: 'warning' },
  confirmed: { label: 'Đã xác nhận', variant: 'info' },
  packing: { label: 'Đang đóng gói', variant: 'info' },
  packed: { label: 'Đã đóng gói', variant: 'info' },
  shipping: { label: 'Đang giao', variant: 'info' },
  delivered: { label: 'Đã giao', variant: 'success' },
  completed: { label: 'Hoàn thành', variant: 'success' },
  cancelled: { label: 'Đã hủy', variant: 'danger' },
  returned: { label: 'Hoàn hàng', variant: 'danger' },
};

export const VIDEO_STATUS_BADGES: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  uploaded: { label: 'Đã upload', variant: 'warning' },
  processing: { label: 'Đang xử lý', variant: 'info' },
  completed: { label: 'Hoàn thành', variant: 'success' },
  failed: { label: 'Thất bại', variant: 'danger' },
};
