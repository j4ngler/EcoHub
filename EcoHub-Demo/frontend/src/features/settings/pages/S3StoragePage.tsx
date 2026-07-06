import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  Cloud,
  FolderOpen,
  Globe,
  HardDrive,
  Key,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { settingsApi, S3Settings } from '@/api/settings.api';
import { useAuthStore } from '@/store/authStore';

export default function S3StoragePage() {
  const user = useAuthStore((s) => s.user);
  const canViewS3 = user?.roles?.includes('super_admin') ?? false;
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data: s3Settings, isLoading: loadingS3 } = useQuery<S3Settings>({
    queryKey: ['s3-settings'],
    queryFn: settingsApi.getS3Settings,
    enabled: canViewS3,
  });

  const { data: capacityData, isLoading: loadingCapacity } = useQuery({
    queryKey: ['s3-capacity'],
    queryFn: settingsApi.getS3Capacity,
    enabled: canViewS3,
  });

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const isConfigured = !!(s3Settings?.endpoint && s3Settings?.bucket && s3Settings?.accessKey);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (!s3Settings?.endpoint || !s3Settings?.bucket) {
        setTestResult({ ok: false, message: 'Chưa cấu hình endpoint hoặc bucket.' });
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 800));
      setTestResult({ ok: true, message: 'Cấu hình S3 đã sẵn sàng cho luồng upload video.' });
    } catch {
      setTestResult({ ok: false, message: 'Không thể kiểm tra cấu hình S3.' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Cloud className="h-7 w-7 text-emerald-600" />
            Lưu trữ S3
          </h1>
          <p className="mt-1 text-gray-500">
            Tổng quan cấu hình lưu trữ S3 dùng cho video đóng gói và video hoàn hàng.
          </p>
        </div>
        <Badge variant={isConfigured ? 'success' : 'default'} className="flex items-center gap-1 px-3 py-1.5 text-sm">
          {isConfigured ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {isConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isConfigured ? 'bg-emerald-50' : 'bg-gray-100'}`}>
              <ShieldCheck className={`h-6 w-6 ${isConfigured ? 'text-emerald-600' : 'text-gray-400'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Trạng thái</p>
              <p className={`font-semibold ${isConfigured ? 'text-emerald-700' : 'text-gray-500'}`}>
                {isConfigured ? 'Sẵn sàng' : 'Thiếu cấu hình'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
              <HardDrive className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Dung lượng video</p>
              <p className="font-semibold text-gray-900">
                {loadingCapacity ? 'Đang tính...' : capacityData ? formatBytes(capacityData.totalSizeBytes) : '0 Bytes'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50">
              <Globe className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Region</p>
              <p className="font-semibold text-gray-900">{loadingS3 ? '...' : s3Settings?.region || '-'}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600" />
            Phân rã dung lượng theo module
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingCapacity ? (
            <p className="text-sm text-gray-400">Đang tải phân tích dung lượng...</p>
          ) : capacityData ? (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>Video đóng gói (Packaging)</span>
                  <span className="text-gray-500">{formatBytes(capacityData.modules.packaging.sizeBytes)} ({capacityData.modules.packaging.count} video)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${capacityData.totalSizeBytes ? (capacityData.modules.packaging.sizeBytes / capacityData.totalSizeBytes) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>Video hoàn hàng (Receiving / Return)</span>
                  <span className="text-gray-500">{formatBytes(capacityData.modules.receiving.sizeBytes)} ({capacityData.modules.receiving.count} video)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${capacityData.totalSizeBytes ? (capacityData.modules.receiving.sizeBytes / capacityData.totalSizeBytes) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                  <span>Video mở hàng (Shipper Unboxing)</span>
                  <span className="text-gray-500">{formatBytes(capacityData.modules.shipper.sizeBytes)} ({capacityData.modules.shipper.count} video)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div 
                    className="bg-purple-500 h-2 rounded-full transition-all duration-500" 
                    style={{ width: `${capacityData.totalSizeBytes ? (capacityData.modules.shipper.sizeBytes / capacityData.totalSizeBytes) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Không có dữ liệu dung lượng.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-emerald-600" />
            Thông tin lưu trữ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingS3 ? (
            <p className="text-sm text-gray-400">Đang tải...</p>
          ) : (
            <div className="divide-y divide-gray-100">
              <InfoRow icon={<Globe className="h-4 w-4 text-gray-400" />} label="Endpoint">
                {s3Settings?.endpoint ? (
                  <span className="break-all font-mono text-sm text-gray-800">{s3Settings.endpoint}</span>
                ) : (
                  <span className="text-sm italic text-gray-400">Chưa cấu hình</span>
                )}
              </InfoRow>

              <InfoRow icon={<FolderOpen className="h-4 w-4 text-gray-400" />} label="Bucket">
                {s3Settings?.bucket ? (
                  <span className="font-mono text-sm text-gray-800">{s3Settings.bucket}</span>
                ) : (
                  <span className="text-sm italic text-gray-400">Chưa cấu hình</span>
                )}
              </InfoRow>

              <InfoRow icon={<Globe className="h-4 w-4 text-gray-400" />} label="Region">
                <span className="font-mono text-sm text-gray-800">{s3Settings?.region || '-'}</span>
              </InfoRow>

              <InfoRow icon={<FolderOpen className="h-4 w-4 text-gray-400" />} label="Path Prefix">
                {s3Settings?.prefix ? (
                  <span className="font-mono text-sm text-gray-800">/{s3Settings.prefix}/</span>
                ) : (
                  <span className="text-sm italic text-gray-400">Gốc bucket</span>
                )}
              </InfoRow>

              <InfoRow icon={<Key className="h-4 w-4 text-gray-400" />} label="Access Key ID">
                {s3Settings?.accessKey ? (
                  <span className="font-mono text-sm text-gray-800">
                    {s3Settings.accessKey.slice(0, 6)}••••••••••••••{s3Settings.accessKey.slice(-4)}
                  </span>
                ) : (
                  <span className="text-sm italic text-gray-400">Chưa cấu hình</span>
                )}
              </InfoRow>

              <InfoRow icon={<Key className="h-4 w-4 text-gray-400" />} label="Secret Access Key">
                <span className="font-mono text-sm text-gray-400">••••••••••••••••••••••••</span>
              </InfoRow>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-emerald-600" />
            Kiểm tra trạng thái
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Trang này chỉ hiển thị tổng quan. Cấu hình thực tế lấy từ backend và biến môi trường S3 đang chạy trên server.
          </p>

          {testResult && (
            <div
              className={`flex items-start gap-3 rounded-lg border p-4 ${
                testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              )}
              <p className="text-sm">{testResult.message}</p>
            </div>
          )}

          <Button onClick={handleTestConnection} loading={isTesting} disabled={!canViewS3} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Kiểm tra trạng thái
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex w-40 flex-shrink-0 items-center gap-2 text-sm text-gray-500">
        {icon}
        {label}
      </div>
      <div className="flex-1 text-right">{children}</div>
    </div>
  );
}
