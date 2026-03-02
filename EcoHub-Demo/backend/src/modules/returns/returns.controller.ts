import { Request, Response, NextFunction } from 'express';
import * as returnService from './returns.service';
import { success, created, paginated } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getReturns = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await returnService.getReturns({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      status: req.query.status as string,
      orderId: req.query.orderId as string,
    });
    
    paginated(res, result.returns, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getReturnById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const returnRequest = await returnService.getReturnById(req.params.id);
    success(res, returnRequest);
  } catch (error) {
    next(error);
  }
};

export const createReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const returnRequest = await returnService.createReturn({
      ...req.body,
      customerId: req.user!.userId,
    });
    created(res, returnRequest, 'Tạo yêu cầu hoàn trả thành công');
  } catch (error) {
    next(error);
  }
};

export const approveReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refundAmount, notes } = req.body;
    const returnRequest = await returnService.approveReturn(
      req.params.id,
      req.user!.userId,
      refundAmount,
      notes
    );
    success(res, returnRequest, 'Duyệt yêu cầu hoàn trả thành công');
  } catch (error) {
    next(error);
  }
};

export const rejectReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { notes } = req.body;
    const returnRequest = await returnService.rejectReturn(
      req.params.id,
      req.user!.userId,
      notes
    );
    success(res, returnRequest, 'Từ chối yêu cầu hoàn trả');
  } catch (error) {
    next(error);
  }
};

export const completeReturn = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const returnRequest = await returnService.completeReturn(req.params.id);
    success(res, returnRequest, 'Hoàn tất hoàn trả');
  } catch (error) {
    next(error);
  }
};
