import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Package, Edit, Trash2 } from 'lucide-react';
import { productsApi, ProductQueryParams } from '@/api/products.api';
import { Card, CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { formatCurrency, formatNumber } from '@/utils/format';

export default function ProductsPage() {
  const [filters, setFilters] = useState<ProductQueryParams>({
    page: 1,
    limit: 10,
    search: '',
  });

  const { data, isLoading } = useQuery({
    queryKey: ['products', filters],
    queryFn: () => productsApi.getProducts(filters),
  });

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
          <p className="text-gray-500">Quản lý kho sản phẩm</p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Thêm sản phẩm
        </Button>
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

                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" className="flex-1">
                        <Edit className="w-4 h-4 mr-1" />
                        Sửa
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
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
    </div>
  );
}
