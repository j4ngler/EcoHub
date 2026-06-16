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
              Luong upload thu cong
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-600">
            <p>
              Neu can giu luong upload video co san tu may thay vi quay truc tiep bang runtime, buoc tiep
              theo la tach no thanh mot trang rieng de khong tron voi dashboard van hanh.
            </p>
            <p>
              Hien tai phan runtime da duoc dua ve dung trang nay, con dashboard trang chu quay lai vai tro
              tong quan he thong.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-cyan-600" />
              Dieu huong nhanh
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link
              to="/videos"
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <ListVideo className="h-4 w-4 text-emerald-600" />
              Di toi danh sach video da luu
            </Link>
            <Link
              to="/settings"
              className="flex items-center gap-2 rounded-lg border px-4 py-3 text-gray-700 transition hover:border-emerald-300 hover:bg-emerald-50"
            >
              <HardDrive className="h-4 w-4 text-emerald-600" />
              Mo cai dat camera va phien nhan vien
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
