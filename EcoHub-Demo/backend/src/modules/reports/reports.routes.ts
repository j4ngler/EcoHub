import { Router } from 'express';
import * as reportController from './reports.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Dashboard summary
router.get('/dashboard', reportController.getDashboard);

// Order reports
router.get('/orders', reportController.getOrderReport);

// Video reports
router.get('/videos', reportController.getVideoReport);

// Revenue reports
router.get('/revenue', reportController.getRevenueReport);

// Staff performance
router.get('/staff-performance', reportController.getStaffPerformance);

// Operational report (daily)
router.get('/operational', reportController.getOperationalReport);

// Sync now
router.post('/sync-now', authorizePermission('orders.create'), reportController.syncNow);

// Export report
router.get('/export', authorizePermission('reports.export'), reportController.exportReport);

export default router;
