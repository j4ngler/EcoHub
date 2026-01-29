import { Router } from 'express';
import * as authController from './auth.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate } from '../../middlewares/auth.middleware';
import { loginSchema, registerSchema, refreshTokenSchema } from './auth.dto';

const router = Router();

// Public routes
router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/refresh-token', validate(refreshTokenSchema), authController.refreshToken);

// Protected routes
router.use(authenticate);
router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.put('/me', authController.updateMe);
router.put('/change-password', authController.changePassword);

export default router;
