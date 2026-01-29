import { Request, Response, NextFunction } from 'express';
import * as productService from './products.service';
import { success, created, paginated, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getProducts = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await productService.getProducts({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      search: req.query.search as string,
      shopId: req.query.shopId as string,
      categoryId: req.query.categoryId as string,
      status: req.query.status as string,
    });
    
    paginated(res, result.products, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getProductById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.getProductById(req.params.id);
    success(res, product);
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.createProduct(req.body, req.user!.userId);
    created(res, product, 'Tạo sản phẩm thành công');
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    success(res, product, 'Cập nhật sản phẩm thành công');
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await productService.deleteProduct(req.params.id);
    noContent(res);
  } catch (error) {
    next(error);
  }
};

export const updateStock = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { quantity, type } = req.body;
    const product = await productService.updateStock(req.params.id, quantity, type);
    success(res, product, 'Cập nhật tồn kho thành công');
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await productService.getCategories(req.query.shopId as string);
    success(res, categories);
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const category = await productService.createCategory(req.body);
    created(res, category, 'Tạo danh mục thành công');
  } catch (error) {
    next(error);
  }
};
