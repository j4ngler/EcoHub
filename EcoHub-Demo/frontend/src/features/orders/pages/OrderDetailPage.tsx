import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
  CheckCircle,
  Play,
  Download,
} from 'lucide-react';
import { ordersApi } from '@/api/orders.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [openVideo, setOpenVideo] = useState(false);
  const [activeVideo, setActiveVideo] = useState<any | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.getOrderById(id!),
    enabled: !!id,
  });

  // Tính URL phát video, bỏ qua các video demo không có file thật (/uploads/demo/...)
  const rawPlayableUrl =
    (activeVideo?.processedVideoUrl as string | undefined) ||
    (activeVideo?.originalVideoUrl as string | undefined) ||
    (activeVideo?.videoUrl as string | undefined) ||
    '';
  const isDemoVideo = rawPlayableUrl.includes('/uploads/demo/');
  const playableUrl = isDemoVideo ? '' : rawPlayableUrl;

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Không tìm thấy đơn hàng</p>
        <Link to="/orders" className="text-primary-600 hover:underline mt-2 inline-block">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const statusConfig = ORDER_STATUS_BADGES[order.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/orders" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{order.orderCode}</h1>
              <Badge variant={statusConfig?.variant || 'default'}>
                {statusConfig?.label || order.status}
              </Badge>
            </div>
            <p className="text-gray-500">Tạo lúc {formatDateTime(order.createdAt)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">In đơn hàng</Button>
          <Button>Cập nhật trạng thái</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" />
                Sản phẩm ({order.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {order.items?.map((item, index) => (
                  <div key={index} className="py-4 flex items-center gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      <Package className="w-8 h-8 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{item.productName}</p>
                      {item.productSku && (
                        <p className="text-sm text-gray-500">SKU: {item.productSku}</p>
                      )}
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
              
              {/* Totals */}
              <div className="border-t pt-4 mt-4 space-y-2">
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
                <div className="flex justify-between font-medium text-lg pt-2 border-t">
                  <span>Tổng cộng</span>
                  <span className="text-primary-600">{formatCurrency(order.totalAmount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Videos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
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
                        className="w-full border rounded-lg px-4 py-3 text-left hover:shadow-md hover:bg-gray-50 transition"
                        title="Tải video"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">
                              {video.trackingCode ||
                                order.trackingCode ||
                                order.orderCode ||
                                'Video đóng gói'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(video.createdAt)}
                            </p>
                            {fileName && (
                              <p className="text-xs text-gray-400 break-all mt-1">
                                {fileName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-primary-600">
                            <Download className="w-4 h-4" />
                            <span className="text-sm font-medium">Tải về</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Video className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>Chưa có video đóng gói</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Khách hàng
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                  <span className="font-medium text-primary-600">
                    {order.customerName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="font-medium">{order.customerName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                {order.customerPhone}
              </div>
              {order.customerEmail && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="w-4 h-4" />
                  {order.customerEmail}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shipping info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Truck className="w-5 h-5" />
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
                <div className="flex items-start gap-2 mt-1">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <p className="text-sm">{order.shippingAddress}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status history */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
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
                        <div className={`w-3 h-3 rounded-full ${index === 0 ? 'bg-primary-600' : 'bg-gray-300'}`} />
                        {order.statusHistory && index < order.statusHistory.length - 1 && (
                          <div className="absolute top-3 left-1.5 w-0.5 h-full -translate-x-1/2 bg-gray-200" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <Badge variant={historyStatus?.variant || 'default'} className="mb-1">
                          {historyStatus?.label || history.status}
                        </Badge>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(history.createdAt)}
                        </p>
                        {history.note && (
                          <p className="text-sm text-gray-600 mt-1">{history.note}</p>
                        )}
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
            <p className="text-sm text-gray-600 break-all">
              Đường dẫn file: <span className="font-mono">{playableUrl}</span>
            </p>
            <a
              href={playableUrl}
              download
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4 mr-2" />
              Tải video (.mp4)
            </a>
            <p className="text-xs text-gray-400">
              Nếu trình duyệt không tự tải, hãy chuột phải vào đường dẫn và chọn &quot;Save
              link as...&quot;.
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            {isDemoVideo
              ? 'Đây là dữ liệu demo, hệ thống không có file video thật để phát. Vui lòng upload video mới cho đơn hàng này nếu bạn muốn xem lại.'
              : 'Video này chưa có đường dẫn phát (thiếu `originalVideoUrl/processedVideoUrl`).'}
          </div>
        )}
      </Modal>
    </div>
  );
}
