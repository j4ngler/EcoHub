import { Router } from 'express';
import * as reportController from './reports.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Dashboard summary
router.get('/dashboard', authorizePermission('reports.view'), reportController.getDashboard);

// Order reports
router.get('/orders', authorizePermission('reports.view'), reportController.getOrderReport);

// Video reports
router.get('/videos', authorizePermission('reports.view'), reportController.getVideoReport);

// Revenue reports
router.get('/revenue', authorizePermission('reports.view'), reportController.getRevenueReport);

// Staff performance
router.get('/staff-performance', authorizePermission('reports.view'), reportController.getStaffPerformance);

// Export report
router.get('/export', authorizePermission('reports.export'), reportController.exportReport);

export default router;
