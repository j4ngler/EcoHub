import { Request, Response, NextFunction } from 'express';
import * as settingsService from './settings.service';
import { success, created, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getReportSubscriptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subscriptions = await settingsService.getReportSubscriptions();
    success(res, subscriptions);
  } catch (error) {
    next(error);
  }
};

export const createReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subscription = await settingsService.createReportSubscription(req.body);
    created(res, subscription, 'Đã thêm email nhận báo cáo');
  } catch (error) {
    next(error);
  }
};

export const updateReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subscription = await settingsService.updateReportSubscription(req.params.id, req.body);
    success(res, subscription, 'Đã cập nhật cấu hình email');
  } catch (error) {
    next(error);
  }
};

export const deleteReportSubscription = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await settingsService.deleteReportSubscription(req.params.id);
    noContent(res);
  } catch (error) {
    next(error);
  }
};
