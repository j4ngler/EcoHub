import { Router } from 'express';
import * as channelController from './channels.controller';
import { RoleName } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/tiktok/callback', channelController.tiktokOAuthCallback);
router.get('/auth/tiktok/callback', channelController.tiktokOAuthCallback);

router.use(authenticate);

router.get('/', channelController.getChannels);
router.get(
  '/admin/overview',
  authorize(RoleName.super_admin),
  channelController.getAdminApiOverview
);
router.get(
  '/shop/:shopId/connections',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getShopConnections
);
router.get(
  '/shop/:shopId/overview',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getShopChannelOverview
);
router.get(
  '/:id/oauth-info',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getChannelOAuthInfo
);
router.get(
  '/:id/debug-info',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.getChannelDebugInfo
);
router.get(
  '/:id',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getChannelById
);

router.post(
  '/:id/connect',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.connectChannel
);
router.post(
  '/:id/test-api',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.testChannelApi
);
router.post(
  '/:id/merchant-token',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.applyMerchantTokenFallback
);
router.post(
  '/:id/sync-orders',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.syncOrders
);
router.post(
  '/:id/sync-products',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.syncProducts
);

router.delete(
  '/:id/disconnect',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  channelController.disconnectChannel
);

export default router;
