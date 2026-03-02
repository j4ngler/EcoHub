import api from './axios';

export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed';
export type ReturnReason = 'damaged' | 'wrong_item' | 'defective' | 'not_as_described' | 'other';

export interface ReturnRequest {
  id: string;
  orderId: string;
  customerId: string;
  reason: ReturnReason;
  description?: string | null;
  images?: string[] | null;
  status: ReturnStatus;
  refundAmount?: number | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  refundedAt?: string | null;
  createdAt: string;
  order?: {
    id: string;
    orderCode: string;
    customerName: string;
    totalAmount: number;
  };
  customer?: { id: string; fullName: string; email: string; phone?: string | null };
  reviewer?: { id: string; fullName: string } | null;
}

export interface ReturnsListParams {
  page?: number;
  limit?: number;
  status?: ReturnStatus;
  orderId?: string;
}

export interface ReturnsListResponse {
  data: ReturnRequest[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateReturnDto {
  orderId: string;
  reason: ReturnReason;
  description?: string;
  images?: string[];
}

export const returnReasonLabels: Record<ReturnReason, string> = {
  damaged: 'Hàng bị hỏng',
  wrong_item: 'Sai sản phẩm',
  defective: 'Lỗi sản phẩm',
  not_as_described: 'Không đúng mô tả',
  other: 'Khác',
};

export const returnsApi = {
  list: async (params: ReturnsListParams): Promise<ReturnsListResponse> => {
    const res = await api.get('/returns', { params });
    return res.data;
  },
  getById: async (id: string): Promise<ReturnRequest> => {
    const res = await api.get(`/returns/${id}`);
    return res.data.data;
  },
  create: async (payload: CreateReturnDto): Promise<ReturnRequest> => {
    const res = await api.post('/returns', payload);
    return res.data.data;
  },
  approve: async (id: string, payload: { refundAmount: number; notes?: string }): Promise<ReturnRequest> => {
    const res = await api.put(`/returns/${id}/approve`, payload);
    return res.data.data;
  },
  reject: async (id: string, payload: { notes?: string }): Promise<ReturnRequest> => {
    const res = await api.put(`/returns/${id}/reject`, payload);
    return res.data.data;
  },
  complete: async (id: string): Promise<ReturnRequest> => {
    const res = await api.put(`/returns/${id}/complete`);
    return res.data.data;
  },
};
