import { Router } from 'express';
import * as orderController from './orders.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { createOrderSchema, updateOrderSchema, queryOrdersSchema, updateStatusSchema } from './orders.dto';

const router = Router();

// Public tracking page for shippers/customers. It returns only one order by tracking code.
router.get('/tracking/:trackingCode', orderController.getOrderByTrackingCode);

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

// Tra cứu đơn hàng theo mã (tab "Tra cứu đơn hàng" - quét QR/nhập mã trong giao diện đã đăng nhập)
router.get(
  '/lookup/:code',
  authorizePermission('orders.view'),
  orderController.lookupOrderByCode
);

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
