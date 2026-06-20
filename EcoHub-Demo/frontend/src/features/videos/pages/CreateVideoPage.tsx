import { Link } from 'react-router-dom';
import { HardDrive, ListVideo, UploadCloud } from 'lucide-react';
import PackagingRuntimeBoard from '@/features/videos/components/PackagingRuntimeBoard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export default function CreateVideoPage() {
  return (
    <div className="space-y-6">
      <PackagingRuntimeBoard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-emerald-600" />
              Luồng upload thủ công
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>
              Nếu cần giữ luồng upload video có sẵn từ máy thay vì quay trực tiếp bằng runtime, bước tiếp
              theo là tách nó thành một trang riêng để không trộn với dashboard vận hành.
            </p>
            <p>
              Hiện tại phần runtime đã được đưa về đúng trang này, còn dashboard trang chủ quay lại vai trò
              tổng quan hệ thống.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-cyan-600" />
              Điều hướng nhanh
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link
              to="/videos"
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <ListVideo className="h-4 w-4 text-emerald-600" />
              Đi tới danh sách video đã lưu
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <HardDrive className="h-4 w-4 text-emerald-600" />
              Mở cài đặt camera và phiên nhân viên
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
