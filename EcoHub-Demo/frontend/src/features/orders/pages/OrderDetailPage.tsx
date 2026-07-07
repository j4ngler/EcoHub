import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  Truck,
  User,
  MapPin,
  Phone,
  Mail,
  Video,
  Clock,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersApi } from '@/api/orders.api';
import { getErrorMessage } from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';

// Luồng chuyển trạng thái hợp lệ — phải khớp với validTransitions ở backend
// (orders.service.ts -> updateOrderStatus)
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packing', 'cancelled'],
  packing: ['packed', 'cancelled'],
  packed: ['shipping', 'cancelled'],
  shipping: ['delivered', 'returned'],
  delivered: ['completed', 'returned'],
  completed: [],
  cancelled: [],
  returned: [],
};

const statusOption = (value: string) => ({
  value,
  label: ORDER_STATUS_BADGES[value]?.label || value,
});

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [openVideo, setOpenVideo] = useState(false);
  const [activeVideo, setActiveVideo] = useState<any | null>(null);
  const [openStatus, setOpenStatus] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: '', note: '' });

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOrderById(id!),
    enabled: !!id,
  });

  const allowedNextStatuses = order ? VALID_TRANSITIONS[order.status] ?? [] : [];
  const statusOptions = allowedNextStatuses.map(statusOption);

  // Mỗi lần mở modal: mặc định chọn trạng thái hợp lệ đầu tiên và xóa ghi chú cũ
  useEffect(() => {
    if (openStatus) {
      setStatusForm({ status: allowedNextStatuses[0] ?? '', note: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStatus, order?.status]);

  const updateStatusMutation = useMutation({
    mutationFn: () => ordersApi.updateOrderStatus(id!, statusForm.status, statusForm.note || undefined),
    onSuccess: () => {
      toast.success('Cập nhật trạng thái đơn hàng thành công');
      setOpenStatus(false);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error) || error?.message || 'Cập nhật trạng thái thất bại');
    },
  });

  const handleSubmitStatus = () => {
    if (!statusForm.status) {
      toast.error('Vui lòng chọn trạng thái');
      return;
    }
    updateStatusMutation.mutate();
  };

  const accessToken = useAuthStore((s) => s.accessToken);

  const rawUrl =
    (activeVideo?.processedVideoUrl as string | undefined) ||
    (activeVideo?.originalVideoUrl as string | undefined) ||
    (activeVideo?.videoUrl as string | undefined) ||
    '';

  const getPlayableUrlWithToken = (url: string) => {
    if (!url) return '';
    const sep = url.includes('?') ? '&' : '?';
    const finalUrl = `${url}${sep}download=1`;
    const tokenSep = finalUrl.includes('?') ? '&' : '?';
    return accessToken ? `${finalUrl}${tokenSep}access_token=${accessToken}` : finalUrl;
  };

  const playableUrl = getPlayableUrlWithToken(rawUrl);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-64 rounded-xl bg-gray-200" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Không tìm thấy đơn hàng</p>
        <Link to="/orders" className="mt-2 inline-block text-primary-600 hover:underline">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const statusConfig = ORDER_STATUS_BADGES[order.status];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/orders" className="rounded-lg p-2 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{order.orderCode}</h1>
              <Badge variant={statusConfig?.variant || 'default'}>{statusConfig?.label || order.status}</Badge>
            </div>
            <p className="text-gray-500">Tạo lúc {formatDateTime(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">In đơn hàng</Button>
          <Button onClick={() => setOpenStatus(true)}>Cập nhật trạng thái</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Sản phẩm ({order.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {order.items?.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 py-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100">
                      <Package className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      {item.productSku && <p className="text-sm text-gray-500">SKU: {item.productSku}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(item.unitPrice)}</p>
                      <p className="text-sm text-gray-500">x{item.quantity}</p>
                    </div>
                    <div className="w-24 text-right font-medium">
                      {formatCurrency(item.totalPrice || item.unitPrice * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Phí vận chuyển</span>
                  <span>{formatCurrency(order.shippingFee)}</span>
                </div>
                {order.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Giảm giá</span>
                    <span>-{formatCurrency(order.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-lg font-medium">
                  <span>Tổng cộng</span>
                  <span className="text-primary-600">{formatCurrency(order.totalAmount)}</span>
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
              {order.packageVideos && order.packageVideos.length > 0 ? (
                <div className="space-y-3">
                  {order.packageVideos.map((video: any) => {
                    const rawUrl =
                      (video.processedVideoUrl as string | undefined) ||
                      (video.originalVideoUrl as string | undefined) ||
                      (video.videoUrl as string | undefined) ||
                      '';
                    const fileName = rawUrl ? rawUrl.split('/').pop() : '';

                    return (
                      <button
                        key={video.id}
                        type="button"
                        onClick={() => {
                          setActiveVideo(video);
                          setOpenVideo(true);
                        }}
                        className="w-full rounded-lg border px-4 py-3 text-left transition hover:bg-gray-50 hover:shadow-md"
                        title="Tải video"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {video.trackingCode || order.trackingCode || order.orderCode || 'Video đóng gói'}
                            </p>
                            <p className="text-xs text-gray-500">{formatDateTime(video.createdAt)}</p>
                            {fileName && <p className="mt-1 break-all text-xs text-gray-400">{fileName}</p>}
                          </div>
                          <div className="flex items-center gap-1 text-primary-600">
                            <Download className="h-4 w-4" />
                            <span className="text-sm font-medium">Tải về</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  <Video className="mx-auto mb-2 h-12 w-12 text-gray-300" />
                  <p>Chưa có video đóng gói</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Khách hàng
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
                  <span className="font-medium text-primary-600">{order.customerName.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium">{order.customerName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4" />
                {order.customerPhone}
              </div>
              {order.customerEmail && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4" />
                  {order.customerEmail}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                Vận chuyển
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.carrier && (
                <div>
                  <p className="text-sm text-gray-500">Hãng vận chuyển</p>
                  <p className="font-medium">{order.carrier.name}</p>
                </div>
              )}
              {order.trackingCode && (
                <div>
                  <p className="text-sm text-gray-500">Mã vận đơn</p>
                  <p className="font-mono font-medium">{order.trackingCode}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Địa chỉ giao hàng</p>
                <div className="mt-1 flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
                  <p className="text-sm">{order.shippingAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Lịch sử trạng thái
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {order.statusHistory?.map((history: any, index: number) => {
                  const historyStatus = ORDER_STATUS_BADGES[history.status];
                  return (
                    <div key={history.id} className="flex gap-3">
                      <div className="relative">
                        <div className={`h-3 w-3 rounded-full ${index === 0 ? 'bg-primary-600' : 'bg-gray-300'}`} />
                        {order.statusHistory && index < order.statusHistory.length - 1 && (
                          <div className="absolute left-1.5 top-3 h-full w-0.5 -translate-x-1/2 bg-gray-200" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <Badge variant={historyStatus?.variant || 'default'} className="mb-1">
                          {historyStatus?.label || history.status}
                        </Badge>
                        <p className="text-xs text-gray-500">{formatDateTime(history.createdAt)}</p>
                        {history.note && <p className="mt-1 text-sm text-gray-600">{history.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        open={openStatus}
        onClose={() => setOpenStatus(false)}
        title="Cập nhật trạng thái đơn hàng"
        size="md"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>Trạng thái hiện tại:</span>
            <Badge variant={statusConfig?.variant || 'default'}>
              {statusConfig?.label || order.status}
            </Badge>
          </div>

          {statusOptions.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Đơn hàng đang ở trạng thái cuối, không thể chuyển tiếp.
            </p>
          ) : (
            <>
              <Select
                label="Trạng thái mới"
                options={statusOptions}
                value={statusForm.status}
                onChange={(e) => setStatusForm((prev) => ({ ...prev, status: e.target.value }))}
              />

              <div className="w-full">
                <label htmlFor="status-note" className="mb-1 block text-sm font-medium text-gray-700">
                  Ghi chú (tùy chọn)
                </label>
                <textarea
                  id="status-note"
                  rows={3}
                  value={statusForm.note}
                  onChange={(e) => setStatusForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Lý do / ghi chú cho lần đổi trạng thái này"
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenStatus(false)}>
              Hủy
            </Button>
            <Button
              onClick={handleSubmitStatus}
              loading={updateStatusMutation.isPending}
              disabled={statusOptions.length === 0}
            >
              Lưu thay đổi
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={openVideo}
        onClose={() => {
          setOpenVideo(false);
          setActiveVideo(null);
        }}
        title={activeVideo?.trackingCode ? `Video - ${activeVideo.trackingCode}` : 'Tải video'}
        size="xl"
      >
        {playableUrl ? (
          <div className="space-y-4">
            <a
              href={playableUrl}
              download
              className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              <Download className="mr-2 h-4 w-4" />
              Tải video (.mp4)
            </a>
            <p className="text-xs text-gray-400">
              Nếu trình duyệt không tự tải, hãy chuột phải vào đường dẫn và chọn &quot;Save link as...&quot;.
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            Video này chưa có đường dẫn phát hợp lệ (`originalVideoUrl`, `processedVideoUrl` hoặc `videoUrl`).
          </div>
        )}
      </Modal>
    </div>
  );
}
