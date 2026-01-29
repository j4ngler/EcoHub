import { Router } from 'express';
import * as metaController from './meta.controller';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

// Roles list (for user creation UI)
router.get('/roles', authorizePermission('users.view'), metaController.getRoles);

// Shops list (for role scoping / user assignment)
router.get('/shops', authorizePermission('users.view'), metaController.getShops);

export default router;

