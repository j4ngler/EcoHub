import api from './axios';

export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface UsersRole {
  id: string;
  name: string;
  shop?: { id: string; name: string } | null;
}

export interface UsersUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  roles: UsersRole[];
}

export interface UsersListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: UserStatus;
}

export interface UsersListResponse {
  data: UsersUser[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface CreateUserDto {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  status?: UserStatus;
  roleId?: string;
  shopId?: string;
}

export interface UpdateUserDto {
  email?: string;
  fullName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status?: UserStatus;
  password?: string;
}

export const usersApi = {
  list: async (params: UsersListParams): Promise<UsersListResponse> => {
    const res = await api.get('/users', { params });
    return res.data;
  },
  create: async (payload: CreateUserDto): Promise<any> => {
    const res = await api.post('/users', payload);
    return res.data.data;
  },
  update: async (id: string, payload: UpdateUserDto): Promise<any> => {
    const res = await api.put(`/users/${id}`, payload);
    return res.data.data;
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/users/${id}`);
  },
};

