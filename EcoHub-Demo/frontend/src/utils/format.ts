import { format, formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('vi-VN').format(num);
};

export const formatDate = (date: string | Date): string => {
  return format(new Date(date), 'dd/MM/yyyy', { locale: vi });
};

export const formatDateTime = (date: string | Date): string => {
  return format(new Date(date), 'dd/MM/yyyy HH:mm', { locale: vi });
};

export const formatRelativeTime = (date: string | Date): string => {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: vi });
};

export const formatPhone = (phone: string): string => {
  // Format Vietnamese phone number
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
};
