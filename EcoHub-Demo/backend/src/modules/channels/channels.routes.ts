import { Router } from 'express';
import * as channelController from './channels.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { RoleName } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Get all channels
router.get('/', channelController.getChannels);

// Get channel by ID
router.get('/:id', channelController.getChannelById);

// Get shop channel connections
router.get('/shop/:shopId/connections', authorizePermission('settings.view'), channelController.getShopConnections);

// Connect to channel
router.post('/:id/connect', authorizePermission('settings.update'), channelController.connectChannel);

// Disconnect from channel
router.delete('/:id/disconnect', authorizePermission('settings.update'), channelController.disconnectChannel);

// Sync orders from channel
router.post('/:id/sync-orders', authorizePermission('orders.create'), channelController.syncOrders);

// Sync products from channel
router.post('/:id/sync-products', authorizePermission('products.create'), channelController.syncProducts);

export default router;
