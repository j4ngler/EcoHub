import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Download, Eye, Edit, Trash2, ArrowDown, ArrowUp, Package } from 'lucide-react';
import { toast } from 'react-toastify';
import { productsApi, Product } from '@/api/products.api';
import { useAuthStore } from '@/store/authStore';

export default function InventoryPage() {
  const { user, hasRole } = useAuthStore();
  const isAdminLike = hasRole('admin') || hasRole('super_admin');
  const activeShopId = user?.activeShop?.id;
  const [activeTab, setActiveTab] = useState<'stock' | 'import' | 'export'>('stock');
  const [searchTerm, setSearchTerm] = useState('');
  const [importForm, setImportForm] = useState({
    name: '',
    sku: '',
    categoryId: '',
    stockQuantity: '',
    costPrice: '',
    price: '',
    description: ''
  });
  const [exportForm, setExportForm] = useState({
    productId: '',
    quantity: '',
    reason: ''
  });

  const queryClient = useQueryClient();

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products', { search: searchTerm }],
    queryFn: () => productsApi.getProducts({ search: searchTerm, limit: 100 }),
  });

  const products = productsData?.data || [];
  const filteredProducts = products.filter((item) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      item.name.toLowerCase().includes(term) ||
      item.sku.toLowerCase().includes(term) ||
      item.description?.toLowerCase().includes(term)
    );
  });

  const createProductMutation = useMutation({
    mutationFn: (data: Partial<Product>) => productsApi.createProduct(data),
    onSuccess: () => {
      toast.success('Nhập hàng thành công!');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setActiveTab('stock');
      setImportForm({
        name: '',
        sku: '',
        categoryId: '',
        stockQuantity: '',
        costPrice: '',
        price: '',
        description: ''
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Nhập hàng thất bại');
    },
  });

  const updateStockMutation = useMutation({
    mutationFn: ({ id, quantity, type }: { id: string; quantity: number; type: 'set' | 'add' | 'subtract' }) =>
      productsApi.updateStock(id, quantity, type),
    onSuccess: () => {
      toast.success('Xuất hàng thành công!');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setActiveTab('stock');
      setExportForm({
        productId: '',
        quantity: '',
        reason: ''
      });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Xuất hàng thất bại');
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => productsApi.deleteProduct(id),
    onSuccess: () => {
      toast.success('Xóa sản phẩm thành công');
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Xóa sản phẩm thất bại');
    },
  });

  const handleImport = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!importForm.name || !importForm.stockQuantity || !importForm.price) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }

    if (!activeShopId) {
      toast.error('Vui lòng chọn shop đang quản lý trước khi nhập hàng');
      return;
    }
    
    createProductMutation.mutate({
      shopId: activeShopId,
      name: importForm.name,
      sku: importForm.sku || `SKU-${Date.now()}`,
      categoryId: importForm.categoryId || undefined,
      stockQuantity: parseInt(importForm.stockQuantity),
      costPrice: importForm.costPrice ? parseFloat(importForm.costPrice) : undefined,
      price: parseFloat(importForm.price),
      description: importForm.description || undefined,
    });
  };

  const handleExport = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!exportForm.productId || !exportForm.quantity) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    
    const product = products.find(p => p.id === exportForm.productId);
    if (!product) {
      toast.error('Không tìm thấy sản phẩm');
      return;
    }
    
    const quantity = parseInt(exportForm.quantity);
    if (quantity > product.stockQuantity) {
      toast.error('Số lượng xuất vượt quá tồn kho');
      return;
    }
    
    updateStockMutation.mutate({
      id: exportForm.productId,
      quantity,
      type: 'subtract',
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) {
      deleteProductMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quản lý hàng hóa</h1>
        <p className="mt-1 text-gray-500">
          {isAdminLike ? 'Quản lý nhập, xuất và tồn kho hàng hóa' : 'Xem tồn kho hàng hóa trong shop'}
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6" aria-label="Tabs">
            {(isAdminLike ? (['stock', 'import', 'export'] as const) : (['stock'] as const)).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-emerald-500 text-emerald-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab === 'stock' && 'Kho hàng'}
                {tab === 'import' && 'Nhập hàng'}
                {tab === 'export' && 'Xuất hàng'}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'stock' && (
            <>
              {/* Search and Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm sản phẩm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>

                <div className="flex space-x-3">
                  <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex items-center">
                    <Download className="h-4 w-4 mr-2" />
                    Xuất Excel
                  </button>
                  {isAdminLike && (
                    <>
                      <button
                        onClick={() => setActiveTab('import')}
                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center"
                      >
                        <ArrowDown className="h-4 w-4 mr-2" />
                        Nhập hàng
                      </button>
                      <button
                        onClick={() => setActiveTab('export')}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
                      >
                        <ArrowUp className="h-4 w-4 mr-2" />
                        Xuất hàng
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inventory Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sản phẩm</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lượng</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giá nhập</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giá bán</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tổng giá trị</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredProducts.map((item) => {
                      const isLowStock = item.stockQuantity <= item.minStockLevel;
                      return (
                        <tr key={item.id} className={isLowStock ? 'bg-red-50' : ''}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg"></div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{item.name}</div>
                                <div className="text-sm text-gray-500 line-clamp-1">{item.description || 'Không có mô tả'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.sku}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${
                            isLowStock ? 'text-red-600 font-bold' : 'text-gray-900'
                          }`}>
                            {item.stockQuantity.toLocaleString()}
                            {isLowStock && (
                              <span className="ml-2 text-xs text-red-500">(Sắp hết hàng)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.costPrice ? `${item.costPrice.toLocaleString()}đ` : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {item.price.toLocaleString()}đ
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                            {(item.stockQuantity * (item.costPrice || item.price)).toLocaleString()}đ
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button className="text-emerald-600 hover:text-emerald-900" title="Xem chi tiết">
                                <Eye className="h-5 w-5" />
                              </button>
                              {isAdminLike && (
                                <>
                                  <button className="text-blue-600 hover:text-blue-900" title="Chỉnh sửa">
                                    <Edit className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="text-red-600 hover:text-red-900"
                                    title="Xóa"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Empty State */}
              {filteredProducts.length === 0 && (
                <div className="text-center py-12">
                  <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Package className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Không có sản phẩm nào</h3>
                  <p className="mt-1 text-gray-500">
                    {searchTerm 
                      ? 'Không tìm thấy sản phẩm phù hợp với tiêu chí tìm kiếm'
                      : 'Kho hàng của bạn đang trống. Hãy nhập hàng để bắt đầu!'
                    }
                  </p>
                  {!searchTerm && isAdminLike && (
                    <button
                      onClick={() => setActiveTab('import')}
                      className="mt-6 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                      Nhập hàng ngay
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'import' && isAdminLike && (
            <form onSubmit={handleImport} className="max-w-3xl mx-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Nhập hàng mới</h2>
              
              <div className="space-y-6">
                <div>
                  <label htmlFor="import-name" className="block text-sm font-medium text-gray-700 mb-2">
                    Tên sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="import-name"
                    value={importForm.name}
                    onChange={(e) => setImportForm({...importForm, name: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Nhập tên sản phẩm"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="import-sku" className="block text-sm font-medium text-gray-700 mb-2">
                      SKU
                    </label>
                    <input
                      type="text"
                      id="import-sku"
                      value={importForm.sku}
                      onChange={(e) => setImportForm({...importForm, sku: e.target.value})}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Mã SKU (tự động nếu để trống)"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="import-quantity" className="block text-sm font-medium text-gray-700 mb-2">
                      Số lượng <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="import-quantity"
                      value={importForm.stockQuantity}
                      onChange={(e) => setImportForm({...importForm, stockQuantity: e.target.value})}
                      min="1"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Số lượng nhập"
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="import-cost" className="block text-sm font-medium text-gray-700 mb-2">
                      Giá nhập (VNĐ)
                    </label>
                    <input
                      type="number"
                      id="import-cost"
                      value={importForm.costPrice}
                      onChange={(e) => setImportForm({...importForm, costPrice: e.target.value})}
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Giá nhập mỗi sản phẩm"
                    />
                  </div>
                  
                  <div>
                    <label htmlFor="import-price" className="block text-sm font-medium text-gray-700 mb-2">
                      Giá bán (VNĐ) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      id="import-price"
                      value={importForm.price}
                      onChange={(e) => setImportForm({...importForm, price: e.target.value})}
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Giá bán mỗi sản phẩm"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label htmlFor="import-description" className="block text-sm font-medium text-gray-700 mb-2">
                    Mô tả
                  </label>
                  <textarea
                    id="import-description"
                    value={importForm.description}
                    onChange={(e) => setImportForm({...importForm, description: e.target.value})}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Mô tả sản phẩm"
                  ></textarea>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setActiveTab('stock')}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={createProductMutation.isPending}
                    className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
                  >
                    <ArrowDown className="h-5 w-5 mr-2 inline" />
                    {createProductMutation.isPending ? 'Đang nhập...' : 'Nhập hàng'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {activeTab === 'export' && isAdminLike && (
            <form onSubmit={handleExport} className="max-w-3xl mx-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Xuất hàng</h2>
              
              <div className="space-y-6">
                <div>
                  <label htmlFor="export-product" className="block text-sm font-medium text-gray-700 mb-2">
                    Sản phẩm <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="export-product"
                    value={exportForm.productId}
                    onChange={(e) => setExportForm({...exportForm, productId: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  >
                    <option value="">Chọn sản phẩm</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.stockQuantity.toLocaleString()} còn lại)
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label htmlFor="export-quantity" className="block text-sm font-medium text-gray-700 mb-2">
                    Số lượng <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="export-quantity"
                    value={exportForm.quantity}
                    onChange={(e) => setExportForm({...exportForm, quantity: e.target.value})}
                    min="1"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Số lượng xuất"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="export-reason" className="block text-sm font-medium text-gray-700 mb-2">
                    Lý do xuất
                  </label>
                  <textarea
                    id="export-reason"
                    value={exportForm.reason}
                    onChange={(e) => setExportForm({...exportForm, reason: e.target.value})}
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Lý do xuất hàng (bán, tặng, hỏng hóc...)"
                  ></textarea>
                </div>
                
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setActiveTab('stock')}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={updateStockMutation.isPending}
                    className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50"
                  >
                    <ArrowUp className="h-5 w-5 mr-2 inline" />
                    {updateStockMutation.isPending ? 'Đang xuất...' : 'Xuất hàng'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
