import { Router } from 'express';
import * as productController from './products.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { createProductSchema, updateProductSchema, queryProductsSchema } from './products.dto';

const router = Router();

router.use(authenticate);

// Categories
router.get('/categories', authorizePermission('products.view'), productController.getCategories);
router.post('/categories', authorizePermission('products.create'), productController.createCategory);

// Products
router.get('/', authorizePermission('products.view'), validate(queryProductsSchema), productController.getProducts);
router.get('/:id', authorizePermission('products.view'), productController.getProductById);
router.post('/', authorizePermission('products.create'), validate(createProductSchema), productController.createProduct);
router.put('/:id', authorizePermission('products.update'), validate(updateProductSchema), productController.updateProduct);
router.delete('/:id', authorizePermission('products.delete'), productController.deleteProduct);

// Stock management
router.put('/:id/stock', authorizePermission('products.update'), productController.updateStock);

export default router;
