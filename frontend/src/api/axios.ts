import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';

// Use relative path - Vite proxy will handle forwarding in dev, Nginx in prod
const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { accessToken } = useAuthStore.getState();
    
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    
    // If 401 and not already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const { refreshToken, logout, setAuth } = useAuthStore.getState();
      
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh-token`, {
            refreshToken,
          });
          
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;
          const { user } = useAuthStore.getState();
          
          if (user) {
            setAuth(user, newAccessToken, newRefreshToken);
          }
          
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          logout();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        logout();
        window.location.href = '/login';
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;

// Helper for handling API errors
export const getErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'Đã có lỗi xảy ra';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Đã có lỗi xảy ra';
};
