import { Router } from 'express';
import * as productController from './products.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorize, authorizePermission } from '../../middlewares/auth.middleware';
import { RoleName } from '@prisma/client';
import { createProductSchema, updateProductSchema, queryProductsSchema } from './products.dto';

const router = Router();

router.use(authenticate);

// Categories
router.get('/categories', authorizePermission('products.view'), productController.getCategories);
router.post(
  '/categories',
  authorize(RoleName.admin, RoleName.super_admin),
  productController.createCategory
);

// Products
router.get('/', authorizePermission('products.view'), validate(queryProductsSchema), productController.getProducts);
router.get('/:id', authorizePermission('products.view'), productController.getProductById);
router.post(
  '/',
  authorize(RoleName.admin, RoleName.super_admin),
  validate(createProductSchema),
  productController.createProduct
);
router.put(
  '/:id',
  authorize(RoleName.admin, RoleName.super_admin),
  validate(updateProductSchema),
  productController.updateProduct
);
router.delete(
  '/:id',
  authorize(RoleName.admin, RoleName.super_admin),
  productController.deleteProduct
);

// Stock management
router.put(
  '/:id/stock',
  authorize(RoleName.admin, RoleName.super_admin),
  productController.updateStock
);

export default router;
