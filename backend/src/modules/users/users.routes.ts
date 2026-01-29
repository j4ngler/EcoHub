import { Router } from 'express';
import * as userController from './users.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorize, authorizePermission } from '../../middlewares/auth.middleware';
import { createUserSchema, updateUserSchema, queryUsersSchema } from './users.dto';
import { RoleName } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List users - Admin and Super Admin only
router.get(
  '/',
  authorizePermission('users.view'),
  validate(queryUsersSchema),
  userController.getUsers
);

// Get user by ID
router.get(
  '/:id',
  authorizePermission('users.view'),
  userController.getUserById
);

// Create user - Super Admin and Admin only
router.post(
  '/',
  authorizePermission('users.create'),
  validate(createUserSchema),
  userController.createUser
);

// Update user
router.put(
  '/:id',
  authorizePermission('users.update'),
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
