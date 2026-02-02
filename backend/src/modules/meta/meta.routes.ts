import { Router } from 'express';
import * as metaController from './meta.controller';
import { authenticate, authorize } from '../../middlewares/auth.middleware';
import { RoleName } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Roles / Shops: dùng role từ JWT (Admin, Super Admin) để tránh 500 do Prisma trong authorizePermission
router.get('/roles', authorize(RoleName.super_admin, RoleName.admin), metaController.getRoles);
router.get('/shops', authorize(RoleName.super_admin, RoleName.admin), metaController.getShops);

export default router;

