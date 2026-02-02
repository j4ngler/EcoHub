import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (res.headersSent) return next(err);

  const statusCode = err.statusCode || 500;
  // 500: không trả message nội bộ (Prisma, DB) ra client ở production
  const message =
    statusCode === 500 && process.env.NODE_ENV !== 'development'
      ? 'Lỗi hệ thống'
      : (err.message || 'Lỗi hệ thống');

  if (process.env.NODE_ENV === 'development') {
    console.error('[Error]', statusCode, err.message, err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// Common error creators
export const notFound = (message = 'Không tìm thấy') => new ApiError(404, message);
export const badRequest = (message = 'Yêu cầu không hợp lệ') => new ApiError(400, message);
export const unauthorized = (message = 'Chưa xác thực') => new ApiError(401, message);
export const forbidden = (message = 'Không có quyền truy cập') => new ApiError(403, message);
export const conflict = (message = 'Dữ liệu đã tồn tại') => new ApiError(409, message);
export const internalError = (message = 'Lỗi hệ thống') => new ApiError(500, message);
export const serviceUnavailable = (message = 'Dịch vụ tạm thời không khả dụng') => new ApiError(503, message);
