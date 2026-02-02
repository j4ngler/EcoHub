import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import api from '@/api/axios';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/store/authStore';

interface User {
  id: string;
  username?: string;
  email: string;
  fullName: string;
  phone?: string;
  role?: string;
  roles?: string[];
  activeShop?: { id: string; name: string; code: string } | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (userData: any) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const { user: storeUser, setAuth, clearAuth } = useAuthStore();
  const [user, setUser] = useState<User | null>(storeUser);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (storeUser) {
      setUser(storeUser);
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [storeUser]);

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login({ email, password });
      setAuth(response.user, response.accessToken, response.refreshToken);
      setUser(response.user);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Đăng nhập thất bại',
      };
    }
  };

  const register = async (userData: any) => {
    try {
      const response = await authApi.register(userData);
      setAuth(response.user, response.accessToken, response.refreshToken);
      setUser(response.user);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || 'Đăng ký thất bại',
      };
    }
  };

  const logout = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
