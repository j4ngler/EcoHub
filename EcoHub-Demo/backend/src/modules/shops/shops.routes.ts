import { Router } from 'express';
import { authenticate, authorize, authorizePermission } from '../../middlewares/auth.middleware';
import * as shopsController from './shops.controller';
import { validate } from '../../middlewares/validation.middleware';
import { createShopSchema, deleteShopSchema } from './shops.dto';
import { RoleName } from '@prisma/client';

const router = Router();

router.use(authenticate);

// List shops user can manage/view
router.get('/', authorizePermission('settings.view'), shopsController.listShops);

// Create shop (Super Admin only)
router.post('/', authorize(RoleName.super_admin), validate(createShopSchema), shopsController.createShop);

// Delete (deactivate) shop - Super Admin + verify password
router.delete(
  '/:id',
  authorize(RoleName.super_admin),
  validate(deleteShopSchema),
  shopsController.deleteShop
);

export default router;

