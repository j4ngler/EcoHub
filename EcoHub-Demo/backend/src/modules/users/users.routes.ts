import { Router } from 'express';
import * as userController from './users.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorize, authorizePermission } from '../../middlewares/auth.middleware';
import { createUserSchema, updateUserSchema, queryUsersSchema } from './users.dto';
import { RoleName } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List users - Admin và Super Admin (kiểm tra role từ JWT, không gọi Prisma trong middleware → tránh 500)
router.get(
  '/',
  authorize(RoleName.super_admin, RoleName.admin),
  validate(queryUsersSchema),
  userController.getUsers
);

// Get user by ID
router.get(
  '/:id',
  authorizePermission('users.view'),
  userController.getUserById
);

// Create user - Super Admin và Admin (dùng role từ JWT, tránh 403 do permission users.create)
router.post(
  '/',
  authorize(RoleName.super_admin, RoleName.admin),
  validate(createUserSchema),
  userController.createUser
);

// Update user - Super Admin và Admin
router.put(
  '/:id',
  authorize(RoleName.super_admin, RoleName.admin),
  validate(updateUserSchema),
  userController.updateUser
);

// Delete user - Super Admin only
router.delete(
  '/:id',
  authorize(RoleName.super_admin),
  userController.deleteUser
);

// Assign role to user
router.post(
  '/:id/roles',
  authorize(RoleName.super_admin, RoleName.admin),
  userController.assignRole
);

// Remove role from user
router.delete(
  '/:id/roles/:roleId',
  authorize(RoleName.super_admin, RoleName.admin),
  userController.removeRole
);

export default router;
