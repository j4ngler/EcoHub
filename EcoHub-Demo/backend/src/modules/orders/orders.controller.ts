import { Request, Response, NextFunction } from 'express';
import * as orderService from './orders.service';
import { success, created, paginated, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await orderService.getOrders({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      search: req.query.search as string,
      status: req.query.status as string,
      shopId: req.query.shopId as string,
      channelId: req.query.channelId as string,
      carrierId: req.query.carrierId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    }, req.user);
    
    paginated(res, result.orders, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getOrderById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.getOrderById(req.params.id, req.user);
    success(res, order);
  } catch (error) {
    next(error);
  }
};

export const getOrderByTrackingCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.getOrderByTrackingCode(req.params.trackingCode);
    success(res, order);
  } catch (error) {
    next(error);
  }
};

export const createOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.createOrder(req.body, req.user!.userId, req.user);
    created(res, order, 'Tạo đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

export const updateOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const order = await orderService.updateOrder(req.params.id, req.body);
    success(res, order, 'Cập nhật đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, note } = req.body;
    const order = await orderService.updateOrderStatus(
      req.params.id,
      status,
      req.user!.userId,
      note
    );
    success(res, order, 'Cập nhật trạng thái đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

export const deleteOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await orderService.cancelOrder(req.params.id, req.user!.userId);
    success(res, null, 'Hủy đơn hàng thành công');
  } catch (error) {
    next(error);
  }
};

export const getOrderHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const history = await orderService.getOrderHistory(req.params.id);
    success(res, history);
  } catch (error) {
    next(error);
  }
};

export const getOrderStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const stats = await orderService.getOrderStats(
      req.query.shopId as string,
      req.query.startDate as string,
      req.query.endDate as string
    );
    success(res, stats);
  } catch (error) {
    next(error);
  }
};
