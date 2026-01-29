import { Request, Response, NextFunction } from 'express';
import * as channelService from './channels.service';
import { success, created } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getChannels = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const channels = await channelService.getChannels();
    success(res, channels);
  } catch (error) {
    next(error);
  }
};

export const getChannelById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const channel = await channelService.getChannelById(req.params.id);
    success(res, channel);
  } catch (error) {
    next(error);
  }
};

export const getShopConnections = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connections = await channelService.getShopConnections(req.params.shopId);
    success(res, connections);
  } catch (error) {
    next(error);
  }
};

export const connectChannel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const connection = await channelService.connectChannel({
      channelId: req.params.id,
      shopId: req.body.shopId,
      accessToken: req.body.accessToken,
      refreshToken: req.body.refreshToken,
      channelShopId: req.body.channelShopId,
    });
    created(res, connection, 'Kết nối kênh thành công');
  } catch (error) {
    next(error);
  }
};

export const disconnectChannel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await channelService.disconnectChannel(req.params.id, req.body.shopId);
    success(res, null, 'Ngắt kết nối thành công');
  } catch (error) {
    next(error);
  }
};

export const syncOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.syncOrders(
      req.params.id,
      req.body.shopId,
      req.user!.userId
    );
    success(res, result, `Đồng bộ thành công ${result.synced} đơn hàng`);
  } catch (error) {
    next(error);
  }
};

export const syncProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.syncProducts(
      req.params.id,
      req.body.shopId,
      req.user!.userId
    );
    success(res, result, `Đồng bộ thành công ${result.synced} sản phẩm`);
  } catch (error) {
    next(error);
  }
};
