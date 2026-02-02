import { Router } from 'express';
import * as settingsController from './settings.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { RoleName } from '@prisma/client';

const router = Router();

router.use(authenticate);

// GET: bất kỳ user đăng nhập đều xem được. Thêm/sửa/xóa: Super Admin và Admin (dùng role từ JWT, không dùng permission settings.manage vì seed không có).
router.get('/report-subscriptions', settingsController.getReportSubscriptions);
router.post('/report-subscriptions', authorize(RoleName.super_admin, RoleName.admin), settingsController.createReportSubscription);
router.put('/report-subscriptions/:id', authorize(RoleName.super_admin, RoleName.admin), settingsController.updateReportSubscription);
router.delete('/report-subscriptions/:id', authorize(RoleName.super_admin, RoleName.admin), settingsController.deleteReportSubscription);

export default router;
