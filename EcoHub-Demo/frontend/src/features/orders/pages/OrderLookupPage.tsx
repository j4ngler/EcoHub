import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Search, ScanLine, PackageSearch } from 'lucide-react';
import toast from 'react-hot-toast';
import { ordersApi } from '@/api/orders.api';
import { getErrorMessage } from '@/api/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QrCodeScanner from '@/components/QrCodeScanner';

type LookupMode = 'manual' | 'scan';

export default function OrderLookupPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LookupMode>('manual');
  const [code, setCode] = useState('');

  const lookupMutation = useMutation({
    mutationFn: (value: string) => ordersApi.lookupByCode(value),
    onSuccess: (order) => {
      toast.success(`Đã tìm thấy đơn hàng ${order.orderCode}`);
      navigate(`/orders/${order.id}`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    lookupMutation.mutate(value);
  };

  const handleScan = (value: string) => {
    if (lookupMutation.isPending) return;
    setCode(value);
    lookupMutation.mutate(value);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-xl bg-gradient-to-r from-teal-700 to-emerald-600 p-6 text-white">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <PackageSearch className="h-6 w-6" />
          Tra cứu đơn hàng
        </h1>
        <p className="mt-2 text-sm text-emerald-50">
          Nhập mã đơn hàng / mã vận đơn, hoặc dùng camera điện thoại quét mã QR trên kiện hàng để xem
          trạng thái đơn và video đóng gói liên quan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === 'manual' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setMode('manual')}
            >
              <Search className="mr-2 h-4 w-4" />
              Nhập mã
            </Button>
            <Button
              type="button"
              variant={mode === 'scan' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setMode('scan')}
            >
              <ScanLine className="mr-2 h-4 w-4" />
              Quét QR
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {mode === 'manual' ? (
            <form onSubmit={handleManualSubmit} className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Mã đơn hàng hoặc mã vận đơn"
                className="flex-1"
              />
              <Button type="submit" loading={lookupMutation.isPending}>
                Tra cứu
              </Button>
            </form>
          ) : (
            <QrCodeScanner onScan={handleScan} />
          )}

          {lookupMutation.isPending ? (
            <p className="mt-3 text-sm text-gray-500">Đang tìm đơn hàng...</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-gray-600">
          Bạn chỉ xem được đơn hàng thuộc về chính mình. Nếu mã không hợp lệ hoặc đơn hàng không
          thuộc quyền truy cập, hệ thống sẽ báo lỗi tương ứng.
        </CardContent>
      </Card>
    </div>
  );
}
