import { Router } from 'express';
import * as channelController from './channels.controller';
import { RoleName } from '@prisma/client';
import { authenticate, authorize } from '../../middlewares/auth.middleware';

const router = Router();

router.get('/tiktok/callback', channelController.tiktokOAuthCallback);
router.get('/auth/tiktok/callback', channelController.tiktokOAuthCallback);
router.get('/shopee/callback', channelController.shopeeOAuthCallback);
router.get('/auth/shopee/callback', channelController.shopeeOAuthCallback);

router.use(authenticate);

router.get('/', channelController.getChannels);
router.get(
  '/admin/overview',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getAdminApiOverview
);
router.get(
  '/shop/:shopId/connections',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getShopConnections
);
router.get(
  '/connections/channel/:channelId',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getChannelConnections
);
router.get(
  '/shop/:shopId/overview',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getShopChannelOverview
);
router.get(
  '/:id/oauth-info',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getChannelOAuthInfo
);
router.get(
  '/:id/debug-info',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getChannelDebugInfo
);
router.get(
  '/:id',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff, RoleName.customer_service),
  channelController.getChannelById
);

router.post(
  '/:id/connect',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.connectChannel
);
router.post(
  '/:id/test-api',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.testChannelApi
);
router.post(
  '/:id/merchant-token',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.applyMerchantTokenFallback
);
router.post(
  '/:id/sync-orders',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.syncOrders
);
router.post(
  '/:id/sync-products',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.syncProducts
);

router.delete(
  '/:id/disconnect',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.disconnectChannel
);

router.delete(
  '/:id/connection',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.deleteChannelConnection
);

router.get(
  '/connections/:connectionId/eligible-users',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getEligibleUsersForAllocation
);
router.get(
  '/connections/:connectionId/allocations',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.getConnectionAllocations
);
router.post(
  '/connections/:connectionId/allocations',
  authorize(RoleName.super_admin, RoleName.admin),
  channelController.saveConnectionAllocations
);

export default router;

