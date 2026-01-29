import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Camera, ScanBarcode, Video, RefreshCw, Table, UploadCloud, XCircle, Play, Eraser } from 'lucide-react';
import { toast } from 'react-toastify';
import api, { getErrorMessage } from '@/api/axios';
import { ordersApi } from '@/api/orders.api';

const POSITION_OPTIONS = [
  { value: 'top_left', label: 'Góc trên trái' },
  { value: 'top_right', label: 'Góc trên phải' },
  { value: 'bottom_left', label: 'Góc dưới trái' },
  { value: 'bottom_right', label: 'Góc dưới phải' },
];

type UploadStatus = 'pending' | 'uploading' | 'synced' | 'failed';

type UploadRow = {
  id: string;
  txnId: string; // hiển thị giống SwiftTrack
  orderId: string;
  orderCode: string;
  trackingCode: string;
  status: UploadStatus;
  progress: number; // 0..100
  sizeBytes: number;
  retries: number;
  createdAt: string;
  error?: string;
};

export default function CreateVideoPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [orderId, setOrderId] = useState('');
  const [trackingCode, setTrackingCode] = useState(''); // scan/nhập
  const [trackingCodePosition, setTrackingCodePosition] = useState('bottom_right');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isReturn, setIsReturn] = useState(false);

  const [rows, setRows] = useState<UploadRow[]>([]);
  const [searchTxn, setSearchTxn] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | UploadStatus>('all');

  const { data: ordersData } = useQuery({
    queryKey: ['orders-for-video'],
    queryFn: () => ordersApi.getOrders({ page: 1, limit: 100 }),
  });

  const selectedOrder = useMemo(() => {
    return ordersData?.data?.find((o) => o.id === orderId) ?? null;
  }, [ordersData, orderId]);

  const orders = (ordersData?.data ?? []).filter((o) =>
    ['confirmed', 'packing', 'packed'].includes(o.status)
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024 * 1024) {
      toast.error('Video không được vượt quá 500MB');
      return;
    }
    if (!file.type.startsWith('video/')) {
      toast.error('Vui lòng chọn file video (MP4, WebM, MOV, AVI)');
      return;
    }
    setVideoFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleOrderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setOrderId(id);
    const order = orders.find((o) => o.id === id);
    if (order?.trackingCode) setTrackingCode(order.trackingCode);
    else setTrackingCode('');
  };

  const ensureOrderFromTracking = async () => {
    const code = trackingCode.trim();
    if (!code) return;

    const localMatch = orders.find((o) => o.trackingCode === code);
    if (localMatch) {
      setOrderId(localMatch.id);
      return;
    }

    try {
      const order = await ordersApi.getOrderByTrackingCode(code);
      // nếu order không nằm trong list trạng thái cho phép thì vẫn set để user thấy, nhưng START sẽ báo lỗi
      setOrderId(order.id);
    } catch {
      // ignore
    }
  };

  const resetSession = () => {
    setOrderId('');
    setTrackingCode('');
    setTrackingCodePosition('bottom_right');
    setIsReturn(false);
    setVideoFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadOne = async (rowId: string, file: File, payload: FormData) => {
    await api.post('/videos/upload', payload, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (evt) => {
        const total = evt.total || file.size || 1;
        const pct = Math.min(100, Math.round((evt.loaded / total) * 100));
        setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, progress: pct } : r)));
      },
    });
  };

  const startUpload = async () => {
    if (!orderId) {
      toast.error('Vui lòng chọn/scan mã vận đơn để gắn với đơn hàng');
      return;
    }
    if (!videoFile) {
      toast.error('Vui lòng chọn file video');
      return;
    }

    const order = ordersData?.data?.find((o) => o.id === orderId);
    if (!order) {
      toast.error('Không tìm thấy đơn hàng');
      return;
    }

    // Customer/staff flow: chỉ cho phép tạo video với đơn đã confirmed/packing/packed (giống logic cũ)
    if (!['confirmed', 'packing', 'packed'].includes(order.status)) {
      toast.error('Đơn hàng phải ở trạng thái Xác nhận / Đóng gói / Đã đóng gói để tạo video');
      return;
    }

    const txnId = trackingCode.trim() || order.trackingCode || order.orderCode;
    const nowIso = new Date().toISOString();
    const row: UploadRow = {
      id: crypto.randomUUID(),
      txnId,
      orderId,
      orderCode: order.orderCode,
      trackingCode: trackingCode.trim() || order.trackingCode || '',
      status: 'uploading',
      progress: 0,
      sizeBytes: videoFile.size,
      retries: 0,
      createdAt: nowIso,
    };

    setRows((prev) => [row, ...prev]);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('orderId', orderId);
      if (trackingCode.trim()) formData.append('trackingCode', trackingCode.trim());
      formData.append('trackingCodePosition', trackingCodePosition);
      // note: isReturn hiện chỉ là UI (chưa có field backend)

      await uploadOne(row.id, videoFile, formData);
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: 'synced', progress: 100 } : r)));
      toast.success('Upload thành công');
      // giữ lại UI kiểu swifttrack (không auto navigate)
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, status: 'failed', error: getErrorMessage(err) } : r
        )
      );
      toast.error(getErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (searchTxn.trim() && !r.txnId.toLowerCase().includes(searchTxn.trim().toLowerCase())) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, searchTxn, statusFilter]);

  const fmtSize = (bytes: number) => {
    if (!bytes) return '0B';
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    if (kb >= 1) return `${kb.toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const statusLabel: Record<UploadStatus, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'text-gray-300' },
    uploading: { label: 'Uploading', className: 'text-yellow-300' },
    synced: { label: 'Synced', className: 'text-green-300' },
    failed: { label: 'Failed', className: 'text-red-300' },
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-800 p-2 rounded-xl">
      <div className="flex h-[calc(100vh-6rem)] overflow-hidden bg-gray-900 rounded-xl">
        <div className="flex flex-row gap-1 p-2 overflow-hidden w-full">
          {/* LEFT */}
          <div className="flex flex-col bg-gray-900 rounded-lg max-w-6xl w-full overflow-hidden">
            <div className="relative w-full aspect-[16/9]">
              <div className="relative w-full h-full aspect-video max-h-[480px]">
                {/* Timestamp overlay */}
                <div className="bg-gray-900/80 absolute top-2 left-2 flex items-center justify-center text-white rounded-md px-2 py-1 text-lg font-mono">
                  <Video className="w-4 h-4 mr-1" />
                  <span className="text-gray-300">
                    {new Date().toISOString().slice(0, 19).replace('T', ' ')}
                  </span>
                </div>

                {/* Video preview */}
                {previewUrl ? (
                  <video
                    src={previewUrl}
                    className="w-full h-full object-cover rounded-md"
                    controls
                    autoPlay
                    muted
                    loop
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center rounded-md bg-gray-950">
                    <div className="text-center text-gray-400">
                      <Video className="w-16 h-16 mx-auto mb-3 text-gray-600" />
                      <div className="font-mono">Chưa chọn video</div>
                      <button
                        type="button"
                        className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <UploadCloud className="w-4 h-4" />
                        Chọn video
                      </button>
                    </div>
                  </div>
                )}

                {/* Scan overlay box */}
                <div
                  className="absolute border-2 border-dashed border-green-300 bg-green-300/10 pointer-events-none rounded-md"
                  style={{
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '50%',
                    aspectRatio: '4 / 3',
                  }}
                  aria-label="Vùng hiển thị mã vận đơn"
                />
                <ScanBarcode
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 text-green-300/50"
                  aria-hidden="true"
                />

                {/* Tracking overlay text */}
                {trackingCode.trim() && (
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white px-3 py-1 rounded-md font-mono text-sm">
                    {trackingCode.trim()} • {trackingCodePosition}
                  </div>
                )}

                {/* Snapshot button (demo) */}
                <button
                  type="button"
                  className="absolute bottom-2 right-2 z-50 flex items-center rounded px-3 py-1 space-x-2 shadow-md transition bg-blue-900/80 text-white hover:bg-blue-800"
                  onClick={() => toast.info('Chức năng chụp hình sẽ bổ sung sau (demo UI)')}
                >
                  <Camera className="w-4 h-4" />
                  <span className="font-mono">Chụp hình</span>
                </button>
              </div>
            </div>

            {/* Controls below video */}
            <div className="-mt-10 z-10">
              <div className="flex flex-col gap-1">
                {/* File picker row */}
                <div className="flex w-full">
                  <div className="relative flex items-center justify-center gap-2 w-1/2 px-2 h-10 bg-gray-800 border-b border-gray-700 rounded-t-md">
                    <Camera className="text-gray-400" />
                    <div>
                      <button
                        type="button"
                        className="w-full px-2 py-1 bg-gray-700 text-gray-200 border border-gray-600 rounded-md text-xs text-left"
                        onClick={() => fileInputRef.current?.click()}
                        title={videoFile?.name || 'Chọn video'}
                      >
                        {videoFile?.name || 'Chọn video...'}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                  </div>

                  <div className="relative flex items-center justify-center gap-2 w-1/2 px-2 h-10 bg-gray-800 border-b border-gray-700 rounded-t-md">
                    <select
                      className="w-full px-2 py-1 bg-gray-700 text-gray-200 border border-gray-600 rounded-md text-xs"
                      value={orderId}
                      onChange={handleOrderChange}
                      title="Chọn đơn hàng"
                    >
                      <option value="">Chọn đơn hàng...</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.orderCode} — {o.customerName} {o.trackingCode ? `(${o.trackingCode})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Scan input */}
                <div className="flex flex-col gap-1 mt-2">
                  <div className="flex items-center gap-1 w-full px-2">
                    <ScanBarcode className="text-gray-400" />
                    <input
                      autoComplete="off"
                      placeholder="Scan để bắt đầu"
                      className="px-2 py-1 flex-1 bg-lime-300 text-green-800 border border-lime-600 rounded-md focus:outline-none focus:ring-1 focus:ring-lime-500 text-2xl font-bold font-mono"
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      onBlur={ensureOrderFromTracking}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          ensureOrderFromTracking();
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="bg-gray-900 p-1">
                  <div className="flex justify-between max-w-6xl mx-auto">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        disabled={uploading || !orderId || !videoFile}
                        onClick={startUpload}
                        className={`w-full h-24 rounded-lg text-2xl font-bold shadow-lg transition-all duration-200
                          border-2 min-w-[100px] focus:outline-none focus:ring-2 focus:ring-white
                          ${uploading || !orderId || !videoFile ? 'border-gray-700 bg-gray-700 cursor-not-allowed text-gray-500' : 'border-lime-600 bg-lime-500 hover:bg-lime-600 active:bg-lime-700 text-green-950'}`}
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="text-lg tracking-wide font-mono">START<br />(ENTER)</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={resetSession}
                        className="w-full h-24 rounded-lg text-2xl font-bold shadow-lg transition-all duration-200
                          border-2 border-orange-700 min-w-[100px] focus:outline-none focus:ring-2 focus:ring-white
                          bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="text-lg tracking-wide font-mono">CANCEL<br />(ESC)</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTrackingCode('')}
                        className="w-full h-24 rounded-lg text-2xl font-bold shadow-lg transition-all duration-200
                          border-2 border-gray-700 min-w-[100px] focus:outline-none focus:ring-2 focus:ring-white
                          bg-slate-600 hover:bg-slate-700 active:bg-slate-800 text-white"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="text-lg tracking-wide font-mono">CLEAR<br />(F2)</span>
                        </div>
                      </button>
                    </div>

                    {/* Today stat (demo) */}
                    <div className="bg-gray-800/80 text-white p-1 rounded text-center min-w-[130px]">
                      <h3 className="text-sm font-medium mb-2">
                        Hôm nay
                        <button
                          type="button"
                          className="ml-2 text-gray-400 hover:text-gray-200"
                          title="Refresh"
                          onClick={() => toast.info('Đã refresh (demo UI)')}
                        >
                          ↻
                        </button>
                      </h3>
                      <p className="text-2xl font-bold text-green-400 mb-1">
                        {rows.filter((r) => r.status === 'synced').length}
                      </p>
                      <div className="flex items-center justify-center gap-1 text-xs">
                        <span className="text-gray-500">vs Hôm qua</span>
                      </div>
                    </div>
                  </div>

                  <label className="flex items-center gap-2 ml-2 px-2 py-1 rounded select-none">
                    <input
                      className="w-6 h-6 rounded border-slate-400 bg-slate-200 text-green-600 focus:ring-green-500"
                      type="checkbox"
                      checked={isReturn}
                      onChange={(e) => setIsReturn(e.target.checked)}
                    />
                    <span className="text-slate-400 font-bold">HÀNG HOÀN</span>
                  </label>
                </div>

                {/* Extra small options */}
                <div className="px-2 pb-2 flex flex-col md:flex-row gap-2">
                  <select
                    className="px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={trackingCodePosition}
                    onChange={(e) => setTrackingCodePosition(e.target.value)}
                  >
                    {POSITION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Vị trí: {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 hover:bg-gray-700"
                    onClick={() => navigate('/videos')}
                  >
                    Đi tới danh sách video
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col justify-between overflow-y-auto bg-gray-900 w-full">
            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gray-200 font-mono">
                <Table className="w-5 h-5" />
                <span>Upload Queue</span>
              </div>
              <button
                type="button"
                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700"
                title="Refresh"
                onClick={() => toast.info('Đã refresh (demo UI)')}
              >
                <RefreshCw className="w-5 h-5 text-gray-300" />
              </button>
            </div>

            <div className="w-full px-3 pb-4">
              <div className="flex flex-wrap gap-3 items-center mb-3 bg-gray-700 p-3 rounded-md">
                <input
                  placeholder="Search by TxnId..."
                  className="px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                  value={searchTxn}
                  onChange={(e) => setSearchTxn(e.target.value)}
                />
                <select
                  className="px-3 py-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="uploading">Uploading</option>
                  <option value="synced">Synced</option>
                  <option value="failed">Failed</option>
                </select>

                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-md text-white text-sm font-medium ${uploading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                    disabled={uploading}
                    onClick={() => toast.info('Syncing... (demo UI)')}
                  >
                    {uploading ? 'Syncing...' : 'Sync'}
                  </button>
                </div>

                <span className="text-sm text-gray-300">
                  Showing {filteredRows.length} / {rows.length}
                </span>
              </div>

              <table className="w-full text-sm text-left text-gray-300 bg-gray-800 rounded-lg overflow-hidden">
                <thead className="bg-gray-700 text-gray-200">
                  <tr>
                    <th className="px-3 py-2">TxnId</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Progress</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Retries</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-700">
                      <td className="px-3 py-2 font-mono text-gray-200">{r.txnId}</td>
                      <td className={`px-3 py-2 font-mono ${statusLabel[r.status].className}`}>
                        {statusLabel[r.status].label}
                      </td>
                      <td className="px-3 py-2">
                        <div className="w-full bg-gray-700 rounded h-2 overflow-hidden">
                          <div className="bg-green-400 h-2" style={{ width: `${r.progress}%` }} />
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{r.progress}%</div>
                      </td>
                      <td className="px-3 py-2 text-gray-200">{fmtSize(r.sizeBytes)}</td>
                      <td className="px-3 py-2 text-gray-200">{r.retries}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="p-2 rounded hover:bg-gray-700"
                            title="View"
                            onClick={() => toast.info(`${r.orderCode} • ${r.trackingCode || '(no tracking)'}`)}
                          >
                            <Play className="w-4 h-4 text-gray-200" />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded hover:bg-gray-700"
                            title="Clear row"
                            onClick={() => setRows((prev) => prev.filter((x) => x.id !== r.id))}
                          >
                            <XCircle className="w-4 h-4 text-red-300" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredRows.length === 0 && (
                <div className="text-center py-8 text-gray-500">No videos found</div>
              )}

              {/* Helper info */}
              <div className="mt-4 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-gray-300 space-y-1">
                <div><b>Gợi ý:</b> Scan mã vận đơn → hệ thống tự tìm đơn (nếu có) → chọn video → bấm START.</div>
                <div>Đơn phù hợp: trạng thái <b>Xác nhận / Đóng gói / Đã đóng gói</b>.</div>
                {selectedOrder && (
                  <div className="text-gray-200">
                    Đơn đang chọn: <b>{selectedOrder.orderCode}</b> • {selectedOrder.customerName} • {selectedOrder.trackingCode || '(chưa có mã)'} • {selectedOrder.status}
                  </div>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 z-20 bg-slate-900/90 rounded-b px-2 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-gray-800 flex items-center justify-center font-mono">EH</div>
                <span className="flex text-sm text-gray-400 truncate">
                  {selectedOrder ? `Order: ${selectedOrder.orderCode}` : 'EcoHub Create Video'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-gray-200 bg-gray-800 rounded hover:bg-gray-700"
                  onClick={() => setRows([])}
                  title="Clear table"
                >
                  <Eraser className="w-4 h-4 inline mr-2" />
                  Clear table
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium text-red-300"
                  onClick={() => navigate('/login')}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
