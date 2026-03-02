import { Response } from 'express';

interface SuccessResponse<T> {
  success: true;
  message?: string;
  data?: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

interface ErrorResponse {
  success: false;
  message: string;
  errors?: any[];
}

const bigintReplacer = (_key: string, value: unknown) => {
  return typeof value === 'bigint' ? value.toString() : value;
};

const safeJson = (res: Response, statusCode: number, payload: unknown) => {
  // Express `res.json` dùng JSON.stringify mặc định => sẽ vỡ nếu payload có BigInt.
  return res
    .status(statusCode)
    .setHeader('Content-Type', 'application/json; charset=utf-8')
    .send(JSON.stringify(payload, bigintReplacer));
};

export const success = <T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode = 200,
  meta?: SuccessResponse<T>['meta']
) => {
  const response: SuccessResponse<T> = {
    success: true,
  };

  if (message) response.message = message;
  if (data !== undefined) response.data = data;
  if (meta) response.meta = meta;

  return safeJson(res, statusCode, response);
};

export const created = <T>(res: Response, data?: T, message = 'Tạo thành công') => {
  return success(res, data, message, 201);
};

export const noContent = (res: Response) => {
  return res.status(204).send();
};

export const paginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number,
  message?: string
) => {
  const safeLimit = limit > 0 ? limit : 1;
  const totalPages = Math.max(0, Math.ceil(total / safeLimit));
  return success(res, data, message, 200, {
    page,
    limit: safeLimit,
    total,
    totalPages,
  });
};
