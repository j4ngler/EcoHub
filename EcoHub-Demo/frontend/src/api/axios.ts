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

// Response interceptor: 401 → thử refresh token; nếu không được thì tự logout và chuyển về /login
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const is401 = error.response?.status === 401;

    const doLogout = () => {
      useAuthStore.getState().clearAuth();
      window.location.href = '/login';
    };

    // 401 lần 2 (sau khi đã retry) hoặc không có config → logout ngay
    if (is401 && originalRequest?._retry) {
      doLogout();
      return Promise.reject(error);
    }

    if (is401 && originalRequest) {
      originalRequest._retry = true;
      const { refreshToken, clearAuth, setAuth } = useAuthStore.getState();

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh-token`, {
            refreshToken,
          });
          const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data.data;

          let { user } = useAuthStore.getState();
          if (!user) {
            try {
              const meRes = await axios.get(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${newAccessToken}` },
              });
              user = meRes.data.data;
            } catch {
              /* ignore */
            }
          }

          if (user) {
            setAuth(user, newAccessToken, newRefreshToken);
          } else {
            useAuthStore.setState({
              accessToken: newAccessToken,
              refreshToken: newRefreshToken,
              isAuthenticated: true,
            });
          }

          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch {
          doLogout();
          return Promise.reject(error);
        }
      }
      // Không có refreshToken → không có auth, logout và về login
      doLogout();
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
