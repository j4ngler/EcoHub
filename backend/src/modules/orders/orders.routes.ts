import { Router } from 'express';
import * as orderController from './orders.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { createOrderSchema, updateOrderSchema, queryOrdersSchema, updateStatusSchema } from './orders.dto';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List orders
router.get(
  '/',
  authorizePermission('orders.view'),
  validate(queryOrdersSchema),
  orderController.getOrders
);

// Get order statistics
router.get(
  '/stats',
  authorizePermission('orders.view'),
  orderController.getOrderStats
);

// Get order by tracking code (public for customers)
router.get('/tracking/:trackingCode', orderController.getOrderByTrackingCode);

// Get order by ID
router.get(
  '/:id',
  authorizePermission('orders.view'),
  orderController.getOrderById
);

// Create order
router.post(
  '/',
  authorizePermission('orders.create'),
  validate(createOrderSchema),
  orderController.createOrder
);

// Update order
router.put(
  '/:id',
  authorizePermission('orders.update'),
  validate(updateOrderSchema),
  orderController.updateOrder
);

// Update order status
router.put(
  '/:id/status',
  authorizePermission('orders.status'),
  validate(updateStatusSchema),
  orderController.updateOrderStatus
);

// Delete/Cancel order
router.delete(
  '/:id',
  authorizePermission('orders.delete'),
  orderController.deleteOrder
);

// Get order status history
router.get(
  '/:id/history',
  authorizePermission('orders.view'),
  orderController.getOrderHistory
);

export default router;
