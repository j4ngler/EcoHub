import api from './axios';

export interface MetaRole {
  id: string;
  name: string;
  description?: string | null;
}

export interface MetaShop {
  id: string;
  name: string;
  code: string;
  status: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export const metaApi = {
  getRoles: async (): Promise<MetaRole[]> => {
    const res = await api.get('/meta/roles');
    return res.data.data;
  },
  getShops: async (): Promise<MetaShop[]> => {
    const res = await api.get('/meta/shops');
    return res.data.data;
  },
};

