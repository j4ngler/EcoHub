import api from './axios';

export interface OrderItem {
  productId?: string;
  productName: string;
  productSku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
}

export interface Order {
  id: string;
  orderCode: string;
  shopId: string;
  channelId?: string;
  channelOrderId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  shippingAddress: string;
  shippingProvince?: string;
  shippingDistrict?: string;
  shippingWard?: string;
  carrierId?: string;
  trackingCode?: string;
  shippingFee: number;
  codAmount: number;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: string;
  items: OrderItem[];
  shop?: { id: string; name: string; code: string };
  channel?: { id: string; name: string; code: string };
  carrier?: { id: string; name: string; code: string };
  hasVideo?: boolean;
}

export interface OrdersResponse {
  data: Order[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  shopId?: string;
  startDate?: string;
  endDate?: string;
}

export const ordersApi = {
  getOrders: async (params: OrderQueryParams): Promise<OrdersResponse> => {
    // Bỏ các field rỗng/undefined để tránh gửi `status=` gây lỗi Zod ở backend
    const cleanedParams: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanedParams[key] = value;
      }
    });

    const response = await api.get('/orders', { params: cleanedParams });
    return response.data;
  },
  
  getOrderById: async (id: string): Promise<Order> => {
    const response = await api.get(`/orders/${id}`);
    return response.data.data;
  },
  
  getOrderByTrackingCode: async (trackingCode: string): Promise<Order> => {
    const response = await api.get(`/orders/tracking/${trackingCode}`);
    return response.data.data;
  },
  
  createOrder: async (data: Partial<Order>): Promise<Order> => {
    const response = await api.post('/orders', data);
    return response.data.data;
  },
  
  updateOrder: async (id: string, data: Partial<Order>): Promise<Order> => {
    const response = await api.put(`/orders/${id}`, data);
    return response.data.data;
  },
  
  updateOrderStatus: async (id: string, status: string, note?: string): Promise<Order> => {
    const response = await api.put(`/orders/${id}/status`, { status, note });
    return response.data.data;
  },
  
  deleteOrder: async (id: string): Promise<void> => {
    await api.delete(`/orders/${id}`);
  },
  
  getOrderStats: async (params?: { shopId?: string; startDate?: string; endDate?: string }) => {
    const response = await api.get('/orders/stats', { params });
    return response.data.data;
  },
};
