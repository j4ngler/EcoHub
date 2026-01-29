import { Router } from 'express';
import * as returnController from './returns.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { createReturnSchema, queryReturnsSchema } from './returns.dto';

const router = Router();

router.use(authenticate);

// List return requests
router.get('/', authorizePermission('returns.view'), validate(queryReturnsSchema), returnController.getReturns);

// Get return by ID
router.get('/:id', authorizePermission('returns.view'), returnController.getReturnById);

// Create return request (customer)
router.post('/', validate(createReturnSchema), returnController.createReturn);

// Approve return
router.put('/:id/approve', authorizePermission('returns.process'), returnController.approveReturn);

// Reject return
router.put('/:id/reject', authorizePermission('returns.process'), returnController.rejectReturn);

// Complete return (mark as refunded)
router.put('/:id/complete', authorizePermission('returns.process'), returnController.completeReturn);

export default router;
