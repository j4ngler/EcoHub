import { Request, Response, NextFunction } from 'express';
import * as reportService from './reports.service';
import { success } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dashboard = await reportService.getDashboard({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    success(res, dashboard);
  } catch (error) {
    next(error);
  }
};

export const getOrderReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.getOrderReport({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      groupBy: (req.query.groupBy as string) || 'day',
    });
    success(res, report);
  } catch (error) {
    next(error);
  }
};

export const getVideoReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.getVideoReport({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    success(res, report);
  } catch (error) {
    next(error);
  }
};

export const getRevenueReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.getRevenueReport({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      groupBy: (req.query.groupBy as string) || 'day',
    });
    success(res, report);
  } catch (error) {
    next(error);
  }
};

export const getStaffPerformance = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.getStaffPerformance({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    success(res, report);
  } catch (error) {
    next(error);
  }
};

export const getOperationalReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await reportService.getOperationalReport({
      shopId: (req.query.shopId as string) || (req.user?.shopId as string),
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      groupBy: (req.query.groupBy as string) || 'day',
    });
    success(res, report);
  } catch (error) {
    next(error);
  }
};

export const syncNow = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await reportService.syncNow(req.user!.userId, req.body?.channels, req.user?.shopId ?? null);
    success(res, result, 'Đã đồng bộ dữ liệu từ kênh bán hàng');
  } catch (error) {
    next(error);
  }
};

export const exportReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, format } = req.query;
    
    // For now, return JSON
    // In production, you would generate CSV/Excel files
    const data = await reportService.getDashboard({
      shopId: req.query.shopId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    
    success(res, data);
  } catch (error) {
    next(error);
  }
};
