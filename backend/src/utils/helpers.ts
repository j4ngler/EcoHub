import { v4 as uuidv4 } from 'uuid';

/**
 * Generate unique order code
 */
export const generateOrderCode = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
};

/**
 * Generate unique tracking code
 */
export const generateTrackingCode = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ECO${timestamp}${random}`;
};

/**
 * Generate shop code
 */
export const generateShopCode = (name: string): string => {
  const prefix = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 3);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${random}`;
};

/**
 * Pagination helper
 */
export const getPagination = (page?: number, limit?: number) => {
  const currentPage = Math.max(1, page || 1);
  const pageSize = Math.min(100, Math.max(1, limit || 10));
  const skip = (currentPage - 1) * pageSize;

  return {
    page: currentPage,
    limit: pageSize,
    skip,
  };
};

/**
 * Format currency
 */
export const formatCurrency = (amount: number, currency = 'VND'): string => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency,
  }).format(amount);
};

/**
 * Slugify string
 */
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Parse date range filter
 */
export const parseDateRange = (startDate?: string, endDate?: string) => {
  const filters: any = {};
  
  if (startDate) {
    filters.gte = new Date(startDate);
  }
  
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    filters.lte = end;
  }

  return Object.keys(filters).length > 0 ? filters : undefined;
};
