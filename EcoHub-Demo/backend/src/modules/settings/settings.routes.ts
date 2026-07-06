import { Router } from 'express';
import { RoleName } from '@prisma/client';
import * as settingsController from './settings.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validation.middleware';
import { updateCaptureSettingsSchema, updateS3SettingsSchema } from './settings.dto';

const router = Router();

router.use(authenticate);

router.get(
  '/capture',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  settingsController.getCaptureSettings
);
router.put(
  '/capture',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.staff),
  validate(updateCaptureSettingsSchema),
  settingsController.updateCaptureSettings
);

router.get('/report-subscriptions', settingsController.getReportSubscriptions);
router.post(
  '/report-subscriptions',
  authorize(RoleName.super_admin, RoleName.admin),
  settingsController.createReportSubscription
);
router.put(
  '/report-subscriptions/:id',
  authorize(RoleName.super_admin, RoleName.admin),
  settingsController.updateReportSubscription
);
router.delete(
  '/report-subscriptions/:id',
  authorize(RoleName.super_admin, RoleName.admin),
  settingsController.deleteReportSubscription
);

router.get(
  '/s3',
  authorize(RoleName.super_admin),
  settingsController.getS3Settings
);

router.get(
  '/s3/capacity',
  authorize(RoleName.super_admin, RoleName.admin, RoleName.customer_service),
  settingsController.getS3Capacity
);

router.put(
  '/s3',
  authorize(RoleName.super_admin),
  validate(updateS3SettingsSchema),
  settingsController.updateS3Settings
);

export default router;
