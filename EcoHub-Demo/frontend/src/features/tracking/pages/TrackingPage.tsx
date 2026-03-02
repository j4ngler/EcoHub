import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, Truck, Video, CheckCircle, Clock, MapPin } from 'lucide-react';
import { ordersApi } from '@/api/orders.api';
import { videosApi } from '@/api/videos.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge, { ORDER_STATUS_BADGES } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/utils/format';

export default function TrackingPage() {
  const { trackingCode: urlTrackingCode } = useParams();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState(urlTrackingCode || '');
  const [trackingCode, setTrackingCode] = useState(urlTrackingCode || '');

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['tracking', trackingCode],
    queryFn: () => ordersApi.getOrderByTrackingCode(trackingCode),
    enabled: !!trackingCode,
  });

  const { data: videos } = useQuery({
    queryKey: ['trackingVideos', trackingCode],
    queryFn: () => videosApi.getVideoByTrackingCode(trackingCode),
    enabled: !!trackingCode,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCode.trim()) {
      setTrackingCode(searchCode.trim());
      navigate(`/tracking/${searchCode.trim()}`);
    }
  };

  const statusConfig = order ? ORDER_STATUS_BADGES[order.status] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-blue-100">
      {/* Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">EcoHub Tracking</h1>
              <p className="text-sm text-gray-500">Tra cứu đơn hàng và video đóng gói</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Search form */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <form onSubmit={handleSearch}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nhập mã vận đơn để tra cứu
              </label>
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value)}
                    placeholder="Ví dụ: ECOXYZ123456"
                    className="input pl-10"
                  />
                </div>
                <Button type="submit">Tra cứu</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Loading */}
        {isLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-500">Đang tìm kiếm...</p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {error && trackingCode && (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">Không tìm thấy đơn hàng với mã vận đơn này</p>
              <p className="text-sm text-gray-400 mt-2">
                Vui lòng kiểm tra lại mã vận đơn
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {order && (
          <div className="space-y-6">
            {/* Order info */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Thông tin đơn hàng
                  </CardTitle>
                  <Badge variant={statusConfig?.variant || 'default'}>
                    {statusConfig?.label || order.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Mã đơn hàng</p>
                    <p className="font-medium">{order.orderCode}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Mã vận đơn</p>
                    <p className="font-mono font-medium">{order.trackingCode}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Người nhận</p>
                    <p className="font-medium">{order.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Giá trị đơn hàng</p>
                    <p className="font-medium text-primary-600">{formatCurrency(order.totalAmount)}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-500 mb-1">Địa chỉ giao hàng</p>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <p>{order.shippingAddress}</p>
                  </div>
                </div>

                {/* Products */}
                <div>
                  <p className="text-sm text-gray-500 mb-2">Sản phẩm</p>
                  <div className="space-y-2">
                    {order.items?.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-white rounded flex items-center justify-center">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                          <div>
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-sm text-gray-500">x{item.quantity}</p>
                          </div>
                        </div>
                        <p className="font-medium">{formatCurrency(item.unitPrice)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Trạng thái vận chuyển
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.packedAt && (
                    <div className="flex gap-3">
                      <div className="relative">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <div className="absolute top-3 left-1.5 w-0.5 h-full -translate-x-1/2 bg-gray-200" />
                      </div>
                      <div>
                        <p className="font-medium">Đã đóng gói</p>
                        <p className="text-sm text-gray-500">{formatDateTime(order.packedAt)}</p>
                      </div>
                    </div>
                  )}
                  {order.shippedAt && (
                    <div className="flex gap-3">
                      <div className="relative">
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                        <div className="absolute top-3 left-1.5 w-0.5 h-full -translate-x-1/2 bg-gray-200" />
                      </div>
                      <div>
                        <p className="font-medium">Đang vận chuyển</p>
                        <p className="text-sm text-gray-500">{formatDateTime(order.shippedAt)}</p>
                      </div>
                    </div>
                  )}
                  {order.deliveredAt && (
                    <div className="flex gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                      <div>
                        <p className="font-medium">Đã giao hàng</p>
                        <p className="text-sm text-gray-500">{formatDateTime(order.deliveredAt)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="w-3 h-3 rounded-full bg-primary-600" />
                    <div>
                      <p className="font-medium">Tạo đơn hàng</p>
                      <p className="text-sm text-gray-500">{formatDateTime(order.createdAt)}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Videos */}
            {videos && videos.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="w-5 h-5" />
                    Video đóng gói
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {videos.map((video: any) => (
                      <div
                        key={video.id}
                        className="flex items-center justify-between gap-3 border rounded-lg px-3 py-2 bg-white"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <Video className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {video.trackingCode || order.trackingCode || order.orderCode}
                            </p>
                            <p className="text-xs text-gray-500">
                              Đóng gói lúc: {formatDateTime(video.createdAt)}
                            </p>
                          </div>
                        </div>
                        <Button size="sm" className="shrink-0">
                          Xem video
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
