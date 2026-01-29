import api from './axios';

export interface Product {
  id: string;
  shopId: string;
  categoryId?: string;
  sku: string;
  name: string;
  description?: string;
  price: number;
  costPrice?: number;
  weight?: number;
  stockQuantity: number;
  minStockLevel: number;
  barcode?: string;
  images?: string[];
  status: string;
  createdAt: string;
  shop?: { id: string; name: string; code: string };
  category?: { id: string; name: string };
}

export interface ProductsResponse {
  data: Product[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  shopId?: string;
  categoryId?: string;
  status?: string;
}

export const productsApi = {
  getProducts: async (params: ProductQueryParams): Promise<ProductsResponse> => {
    const response = await api.get('/products', { params });
    return response.data;
  },
  
  getProductById: async (id: string): Promise<Product> => {
    const response = await api.get(`/products/${id}`);
    return response.data.data;
  },
  
  createProduct: async (data: Partial<Product>): Promise<Product> => {
    const response = await api.post('/products', data);
    return response.data.data;
  },
  
  updateProduct: async (id: string, data: Partial<Product>): Promise<Product> => {
    const response = await api.put(`/products/${id}`, data);
    return response.data.data;
  },
  
  deleteProduct: async (id: string): Promise<void> => {
    await api.delete(`/products/${id}`);
  },
  
  updateStock: async (id: string, quantity: number, type: 'set' | 'add' | 'subtract'): Promise<Product> => {
    const response = await api.put(`/products/${id}/stock`, { quantity, type });
    return response.data.data;
  },
  
  getCategories: async (shopId?: string) => {
    const response = await api.get('/products/categories', { params: { shopId } });
    return response.data.data;
  },
};
