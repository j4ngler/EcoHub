import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanLine, Plus, Pencil, Trash2 } from 'lucide-react';
import { captureApi, BarcodeMapping } from '@/api/capture.api';
import { getErrorMessage } from '@/api/axios';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { useAuthStore } from '@/store/authStore';

const emptyForm = { barcode: '', sku: '', note: '' };

export default function BarcodeMappingPage() {
  const { hasRole } = useAuthStore();
  const canManage = hasRole('super_admin') || hasRole('admin');

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BarcodeMapping | null>(null);
  const [form, setForm] = useState(emptyForm);

  const queryClient = useQueryClient();

  const { data: mappings, isLoading } = useQuery({
    queryKey: ['capture', 'barcode-mappings'],
    queryFn: captureApi.getBarcodeMappings,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['capture', 'barcode-mappings'] });

  const createMutation = useMutation({
    mutationFn: captureApi.createBarcodeMapping,
    onSuccess: () => {
      toast.success('Đã thêm ánh xạ mã vạch');
      invalidate();
      closeForm();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: typeof emptyForm }) =>
      captureApi.updateBarcodeMapping(id, data),
    onSuccess: () => {
      toast.success('Đã cập nhật ánh xạ mã vạch');
      invalidate();
      closeForm();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: captureApi.deleteBarcodeMapping,
    onSuccess: () => {
      toast.success('Đã xoá ánh xạ mã vạch');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (m: BarcodeMapping) => {
    setEditing(m);
    setForm({ barcode: m.barcode, sku: m.sku, note: m.note ?? '' });
    setFormOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ánh xạ mã vạch sản phẩm</h1>
          <p className="text-gray-500">
            Map mã vạch in trên phiếu giao hàng (ví dụ mã số của sàn) sang SKU nội bộ, dùng khi quét serial trong
            lúc đóng gói.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm ánh xạ
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            Danh sách ánh xạ
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-24 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : !mappings?.length ? (
            <div className="text-center py-8 text-gray-500">
              <ScanLine className="w-12 h-12 mx-auto mb-2 text-gray-400" />
              <p>Chưa có ánh xạ mã vạch nào. Mã quét không khớp SKU sẽ hiển thị "Mã không khớp đơn" khi đóng gói.</p>
              {canManage && (
                <Button className="mt-4" onClick={openCreate}>
                  Thêm ánh xạ
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4">Mã vạch</th>
                    <th className="py-2 pr-4">SKU nội bộ</th>
                    <th className="py-2 pr-4">Ghi chú</th>
                    {canManage && <th className="py-2 pr-4 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-mono">{m.barcode}</td>
                      <td className="py-2 pr-4 font-medium text-gray-900">{m.sku}</td>
                      <td className="py-2 pr-4 text-gray-500">{m.note || '—'}</td>
                      {canManage && (
                        <td className="py-2 pr-4">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(m)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (window.confirm(`Xoá ánh xạ mã vạch "${m.barcode}"?`)) {
                                  deleteMutation.mutate(m.id);
                                }
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editing ? 'Sửa ánh xạ mã vạch' : 'Thêm ánh xạ mã vạch'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Mã vạch (in trên phiếu/sản phẩm)"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            required
            placeholder="Ví dụ: 792265409"
          />
          <Input
            label="SKU nội bộ tương ứng"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            required
            placeholder="Ví dụ: PC-09TL33"
          />
          <Input
            label="Ghi chú (tùy chọn)"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Ví dụ: Máy lạnh Casper 1HP"
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeForm}>
              Hủy
            </Button>
            <Button type="submit" loading={saving}>
              Lưu
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
