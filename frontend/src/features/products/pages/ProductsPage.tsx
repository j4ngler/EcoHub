import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Package, Edit, Trash2 } from 'lucide-react';
import { productsApi, Product, ProductQueryParams } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatNumber } from '@/utils/format';
import { useAuthStore } from '@/store/authStore';
import Modal from '@/components/ui/Modal';
import { toast } from 'react-hot-toast';

export default function ProductsPage() {
  const { user, hasRole } = useAuthStore();
  const isAdminLike = hasRole('admin') || hasRole('super_admin');
  const activeShopId = user?.activeShop?.id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<ProductQueryParams>({
    page: 1,
    limit: 10,
    search: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', { ...filters, shopId: activeShopId }],
    queryFn: () => productsApi.getProducts({ ...filters, shopId: activeShopId }),
  });

  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<{
    name: string;
    sku: string;
    price: string;
    stockQuantity: string;
    minStockLevel: string;
    description: string;
  }>({
    name: '',
    sku: '',
    price: '',
    stockQuantity: '0',
    minStockLevel: '0',
    description: '',
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      sku: '',
      price: '',
      stockQuantity: '0',
      minStockLevel: '0',
      description: '',
    });
    setShowModal(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      sku: product.sku,
      price: String(product.price ?? ''),
      stockQuantity: String(product.stockQuantity ?? 0),
      minStockLevel: String(product.minStockLevel ?? 0),
      description: product.description || '',
    });
    setShowModal(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: Partial<Product>) => productsApi.createProduct(data),
    onSuccess: () => {
      toast.success('Thêm sản phẩm thành công');
      setShowModal(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Không thể tạo sản phẩm');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      productsApi.updateProduct(id, data),
    onSuccess: () => {
      toast.success('Cập nhật sản phẩm thành công');
      setShowModal(false);
      queryClient.invalidateQueries({ key: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Không thể cập nhật sản phẩm');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.deleteProduct(id),
    onSuccess: () => {
      toast.success('Đã xóa sản phẩm');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Không thể xóa sản phẩm');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.sku || !form.price) {
      toast.error('Vui lòng nhập đầy đủ tên, SKU và giá bán');
      return;
    }
    if (!activeShopId) {
      toast.error('Vui lòng chọn shop đang quản lý trước khi tạo/sửa sản phẩm');
      return;
    }

    const payload: Partial<Product> = {
      shopId: editingProduct?.shopId || activeShopId,
      name: form.name,
      sku: form.sku,
      price: Number(form.price),
      stockQuantity: Number(form.stockQuantity || '0'),
      minStockLevel: Number(form.minStockLevel || '0'),
      description: form.description || undefined,
    };

    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (product: Product) => {
    if (!isAdminLike) return;
    if (window.confirm(`Bạn có chắc muốn xóa sản phẩm "${product.name}"?`)) {
      deleteMutation.mutate(product.id);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' }> = {
      active: { label: 'Đang bán', variant: 'success' },
      inactive: { label: 'Ngừng bán', variant: 'danger' },
      out_of_stock: { label: 'Hết hàng', variant: 'warning' },
    };
    return config[status] || { label: status, variant: 'default' as any };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sản phẩm</h1>
          <p className="text-gray-500">
            {isAdminLike ? 'Quản lý kho sản phẩm' : 'Xem danh sách sản phẩm trong shop'}
          </p>
        </div>
        {isAdminLike && (
          <Button onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm sản phẩm
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Tìm theo tên, SKU, barcode..."
                  className="input pl-10"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Products grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data?.data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Chưa có sản phẩm nào</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {data?.data.map((product) => {
            const statusBadge = getStatusBadge(product.status);
            return (
              <Card key={product.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="aspect-square bg-gray-100 rounded-lg mb-4 flex items-center justify-center">
                    {product.images && product.images[0] ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Package className="w-12 h-12 text-gray-300" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-medium text-gray-900 line-clamp-2">{product.name}</h3>
                    </div>
                    
                    <p className="text-sm text-gray-500">SKU: {product.sku}</p>
                    
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary-600">
                        {formatCurrency(product.price)}
                      </span>
                      <Badge variant={statusBadge.variant}>
                        {statusBadge.label}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Tồn kho:</span>
                      <span className={`font-medium ${
                        product.stockQuantity <= product.minStockLevel 
                          ? 'text-red-600' 
                          : 'text-gray-900'
                      }`}>
                        {formatNumber(product.stockQuantity)}
                      </span>
                    </div>

                    {isAdminLike && (
                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => openEditModal(product as Product)}
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Sửa
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(product as Product)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.meta.page === 1}
            onClick={() => setFilters({ ...filters, page: filters.page! - 1 })}
          >
            Trước
          </Button>
          <span className="text-sm text-gray-500">
            Trang {data.meta.page} / {data.meta.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.meta.page === data.meta.totalPages}
            onClick={() => setFilters({ ...filters, page: filters.page! + 1 })}
          >
            Sau
          </Button>
        </div>
      )}

      {/* Modal tạo / chỉnh sửa sản phẩm */}
      {isAdminLike && (
        <Modal
          open={showModal}
          onClose={() => setShowModal(false)}
          title={editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
        >
          {!activeShopId && (
            <p className="mb-3 text-sm text-red-600">
              Vui lòng vào trang <span className="font-semibold">Shop</span> và chọn &quot;Quản lý
              shop này&quot; trước khi tạo/sửa sản phẩm.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên sản phẩm <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  SKU <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Giá bán (VNĐ) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Số lượng tồn kho
                </label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form.stockQuantity}
                  onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mức cảnh báo tồn kho
                </label>
                <input
                  type="number"
                  min="0"
                  className="input"
                  value={form.minStockLevel}
                  onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
              <textarea
                className="input min-h-[80px]"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isLoading || updateMutation.isLoading || !activeShopId}
              >
                {editingProduct
                  ? updateMutation.isLoading
                    ? 'Đang lưu...'
                    : 'Cập nhật'
                  : createMutation.isLoading
                  ? 'Đang tạo...'
                  : 'Tạo sản phẩm'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
