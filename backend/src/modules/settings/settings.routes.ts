import { Router } from 'express';
import * as settingsController from './settings.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizePermission('settings.manage'));

// Report email subscriptions
router.get('/report-subscriptions', settingsController.getReportSubscriptions);
router.post('/report-subscriptions', settingsController.createReportSubscription);
router.put('/report-subscriptions/:id', settingsController.updateReportSubscription);
router.delete('/report-subscriptions/:id', settingsController.deleteReportSubscription);

export default router;
