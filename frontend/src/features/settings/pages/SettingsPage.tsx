import { useEffect, useState } from 'react';
import { Bell, Globe, Paintbrush } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';

type AppSettings = {
  notifications: boolean;
  compactMode: boolean;
  language: 'vi' | 'en';
};

const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  compactMode: false,
  language: 'vi',
};

const STORAGE_KEY = 'ecohub-app-settings';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      }
    } catch {
      // ignore
    }
  }, []);

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
          <p className="text-gray-500">Cấu hình trải nghiệm sử dụng EcoHub (lưu trên trình duyệt)</p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <Badge variant="success">Đã lưu</Badge>}
          <Button onClick={save}>Lưu cài đặt</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Thông báo</p>
              <p className="text-sm text-gray-500">Bật/tắt toast thông báo trong hệ thống</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.notifications}
              onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Paintbrush className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Chế độ gọn</p>
              <p className="text-sm text-gray-500">Giảm khoảng cách hiển thị để xem được nhiều dữ liệu hơn</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={settings.compactMode}
              onChange={(e) => setSettings({ ...settings, compactMode: e.target.checked })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-gray-900">Ngôn ngữ</p>
              <p className="text-sm text-gray-500">Chọn ngôn ngữ hiển thị (demo)</p>
            </div>
            <select
              className="input w-40"
              value={settings.language}
              onChange={(e) => setSettings({ ...settings, language: e.target.value as AppSettings['language'] })}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-2">
          <p className="font-medium text-gray-900">Gợi ý dữ liệu mẫu</p>
          <p className="text-sm text-gray-500">
            Hệ thống đã có dữ liệu demo để hiển thị dashboard/báo cáo (đơn hàng, sản phẩm, video).
          </p>
          <div className="text-sm text-gray-700">
            <div>- Admin demo: <b>admin.demo@ecohub.vn</b> / <b>Admin@123</b></div>
            <div>- Staff demo: <b>staff.demo@ecohub.vn</b> / <b>Staff@123</b></div>
            <div>- Customer demo: <b>customer.demo@ecohub.vn</b> / <b>Customer@123</b></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

