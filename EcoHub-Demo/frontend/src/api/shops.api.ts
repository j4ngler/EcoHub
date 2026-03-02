import api from './axios';

export interface Shop {
  id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  ownerId?: string;
  role?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const shopsApi = {
  list: async (): Promise<Shop[]> => {
    const res = await api.get('/shops');
    return res.data.data;
  },
  create: async (payload: {
    name: string;
    code: string;
    adminUsername: string;
    adminEmail: string;
    adminPassword: string;
    adminFullName: string;
    adminPhone?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  }): Promise<Shop> => {
    const res = await api.post('/shops', payload);
    return res.data.data;
  },

  delete: async (id: string, superAdminPassword: string): Promise<void> => {
    await api.delete(`/shops/${id}`, {
      data: { superAdminPassword },
    });
  },
};

