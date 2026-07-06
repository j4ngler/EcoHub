import { NextFunction, Response } from 'express';
import * as channelService from './channels.service';
import { created, success } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const tiktokOAuthCallback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.handleTikTokOAuthCallback({
      state: String(req.query.state || ''),
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      authCode: typeof req.query.auth_code === 'string' ? req.query.auth_code : undefined,
      merchantId: typeof req.query.merchant_id === 'string' ? req.query.merchant_id : undefined,
      shopId: typeof req.query.shop_id === 'string' ? req.query.shop_id : undefined,
    });
    res.redirect(result.redirectUrl);
  } catch (error) {
    next(error);
  }
};

export const shopeeOAuthCallback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.handleShopeeOAuthCallback({
      code: typeof req.query.code === 'string' ? req.query.code : undefined,
      shopId: typeof req.query.shop_id === 'string' ? req.query.shop_id : undefined,
      mainAccountId:
        typeof req.query.main_account_id === 'string' ? req.query.main_account_id : undefined,
      state: typeof req.query.state === 'string' ? req.query.state : undefined,
    });
    res.redirect(result.redirectUrl);
  } catch (error) {
    next(error);
  }
};

export const getChannels = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getChannels());
  } catch (error) {
    next(error);
  }
};

export const getAdminApiOverview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getAdminApiOverview());
  } catch (error) {
    next(error);
  }
};

export const getChannelById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getChannelById(req.params.id));
  } catch (error) {
    next(error);
  }
};

export const getShopConnections = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getShopConnections(req.params.shopId));
  } catch (error) {
    next(error);
  }
};

export const getChannelConnections = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getChannelConnections(req.params.channelId));
  } catch (error) {
    next(error);
  }
};

export const getShopChannelOverview = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getShopChannelOverview(req.params.shopId));
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
    created(res, connection, 'Ket noi kenh thanh cong');
  } catch (error) {
    next(error);
  }
};

export const getChannelOAuthInfo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const info = await channelService.getChannelOAuthInfo(
      req.params.id,
      req.user?.userId,
      (typeof req.query.shopId === 'string' ? req.query.shopId : req.user?.shopId) ?? null
    );
    success(res, info);
  } catch (error) {
    next(error);
  }
};

export const disconnectChannel = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await channelService.disconnectChannel(req.params.id, req.body.shopId);
    success(res, null, 'Ngat ket noi thanh cong');
  } catch (error) {
    next(error);
  }
};

export const deleteChannelConnection = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.deleteChannelConnection(req.params.id, req.body.shopId);
    success(res, result, 'Da xoa ket noi API');
  } catch (error) {
    next(error);
  }
};

export const syncOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.syncOrders(req.params.id, req.body.shopId, req.user!.userId);
    success(res, result, 'Yêu cầu đồng bộ đơn hàng đã được xử lý');
  } catch (error) {
    next(error);
  }
};

export const testChannelApi = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.testChannelApi(req.params.id, req.body.shopId, req.user!.userId);
    success(res, result, result.ok ? 'Kiem tra API thanh cong' : 'API chua san sang');
  } catch (error) {
    next(error);
  }
};

export const getChannelDebugInfo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, await channelService.getChannelDebugInfo(req.params.id, req.query.shopId as string));
  } catch (error) {
    next(error);
  }
};

export const applyMerchantTokenFallback = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.applyMerchantTokenFallback({
      channelId: req.params.id,
      shopId: req.body.shopId,
      merchantId: req.body.merchantId,
      accessToken: req.body.accessToken,
      refreshToken: req.body.refreshToken,
    });
    success(res, result, 'Da ap dung merchant token fallback');
  } catch (error) {
    next(error);
  }
};

export const syncProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.syncProducts(req.params.id, req.body.shopId, req.user!.userId);
    success(res, result, `Dong bo thanh cong ${result.synced} san pham`);
  } catch (error) {
    next(error);
  }
};

export const getEligibleUsersForAllocation = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.getEligibleUsersForAllocation(
      req.params.connectionId,
      req.user && {
        userId: req.user.userId,
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );
    success(res, result);
  } catch (error) {
    next(error);
  }
};

export const getConnectionAllocations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.getConnectionAllocations(
      req.params.connectionId,
      req.user && {
        userId: req.user.userId,
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );
    success(res, result);
  } catch (error) {
    next(error);
  }
};

export const saveConnectionAllocations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await channelService.saveConnectionAllocations(
      req.params.connectionId,
      req.body.userIds,
      req.user && {
        userId: req.user.userId,
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );
    success(res, result, 'Cập nhật phân bổ API thành công');
  } catch (error) {
    next(error);
  }
};

