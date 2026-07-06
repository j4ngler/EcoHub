import api from './axios';

export interface LoginDto {
  loginId: string;
  password: string;
}

export interface RegisterDto {
  username: string;
  email: string;
  password: string;
  fullName: string;
  phone?: string;
  role: 'admin' | 'staff' | 'customer_service' | 'customer' | 'shipper';
}

export interface RegisterOptionRole {
  id: string;
  name: 'admin' | 'staff' | 'customer_service' | 'customer';
  description?: string | null;
}

export interface RegisterOptionShop {
  id: string;
  name: string;
  code: string;
}

export interface AuthResponse {
  user: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    phone?: string;
    avatarUrl?: string;
    roles: string[];
    activeShop?: { id: string; name: string; code: string } | null;
  };
  accessToken: string;
  refreshToken: string;
}

export interface PendingRegisterResponse {
  approvalRequired: true;
  message?: string;
  user: AuthResponse['user'] & { status?: string };
}

export type RegisterResponse = AuthResponse | PendingRegisterResponse;

export const authApi = {
  login: async (data: LoginDto): Promise<AuthResponse> => {
    const response = await api.post('/auth/login', data);
    return response.data.data;
  },
  
  register: async (data: RegisterDto): Promise<RegisterResponse> => {
    const response = await api.post('/auth/register', data);
    return response.data.data;
  },

  getRegisterOptions: async (): Promise<{
    roles: RegisterOptionRole[];
    defaultShop: RegisterOptionShop | null;
    shopMode: 'single' | 'multiple';
  }> => {
    const response = await api.get('/auth/register-options');
    return response.data.data;
  },
  
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },
  
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data.data;
  },
  
  refreshToken: async (refreshToken: string) => {
    const response = await api.post('/auth/refresh-token', { refreshToken });
    return response.data.data;
  },
  
  updateMe: async (data: { fullName?: string; phone?: string; avatarUrl?: string }) => {
    const response = await api.put('/auth/me', data);
    return response.data.data;
  },
  
  changePassword: async (data: { currentPassword: string; newPassword: string }) => {
    const response = await api.put('/auth/change-password', data);
    return response.data.data;
  },

  assumeShop: async (shopId: string | null): Promise<AuthResponse> => {
    const response = await api.post('/auth/assume-shop', { shopId });
    return response.data.data;
  },
};
