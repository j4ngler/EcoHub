import { Router } from 'express';
import * as shippingController from './shipping.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Get all carriers
router.get('/carriers', shippingController.getCarriers);

// Get carrier by ID
router.get('/carriers/:id', shippingController.getCarrierById);

// Calculate shipping fee
router.post('/calculate-fee', authorizePermission('shipping.view'), shippingController.calculateFee);

// Track shipment
router.get('/track/:trackingCode', shippingController.trackShipment);

// Shop carrier settings
router.get('/settings/:shopId', authorizePermission('shipping.manage'), shippingController.getShopCarrierSettings);
router.post('/settings', authorizePermission('shipping.manage'), shippingController.saveShopCarrierSetting);

export default router;
