import { Request, Response, NextFunction } from 'express';
import * as userService from './users.service';
import { success, created, paginated, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const page = Number(req.query?.page) || 1;
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 10));
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[getUsers] req.user.shopId:', req.user?.shopId);
      console.log('[getUsers] req.user.roles:', req.user?.roles);
      console.log('[getUsers] req.query:', req.query);
    }
    const { search, role, status } = req.query;
    const result = await userService.getUsers({
      page,
      limit,
      search: typeof search === 'string' && search.trim() ? search.trim() : undefined,
      role: typeof role === 'string' && role.trim() ? role.trim() : undefined,
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
    }, req.user);

    if (process.env.NODE_ENV === 'development') {
      console.log('[getUsers] Result:', { total: result.total, count: result.users.length });
    }
    paginated(res, result.users, result.total, result.page, result.limit);
  } catch (error) {
    console.error('[getUsers]', error);
    // Trả 200 với danh sách rỗng để trang Users vẫn load được, tránh 500
    paginated(res, [], 0, page, limit);
  }
};

export const getUserById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.getUserById(req.params.id, req.user);
    success(res, user);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[createUser] Request body:', JSON.stringify(req.body, null, 2));
      console.log('[createUser] Current user shopId:', req.user?.shopId);
    }
    const user = await userService.createUser(req.body, req.user!.userId, req.user);
    created(res, user, 'Tạo người dùng thành công');
  } catch (error: any) {
    console.error('[createUser] Error:', error?.message || error);
    if (process.env.NODE_ENV === 'development') {
      console.error('[createUser] Stack:', error?.stack);
      console.error('[createUser] Request body was:', JSON.stringify(req.body, null, 2));
    }
    next(error);
  }
};

export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    success(res, user, 'Cập nhật người dùng thành công');
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const transferShopToUserId = req.body?.transferShopToUserId as string | undefined;
    await userService.deleteUser(req.params.id, { transferShopToUserId });
    noContent(res);
  } catch (error) {
    next(error);
  }
};

export const assignRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { roleId, shopId } = req.body;
    const result = await userService.assignRole(req.params.id, roleId, shopId, req.user!.userId, req.user);
    success(res, result, 'Gán vai trò thành công');
  } catch (error) {
    next(error);
  }
};

export const removeRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await userService.removeRole(req.params.id, req.params.roleId);
    success(res, null, 'Xóa vai trò thành công');
  } catch (error) {
    next(error);
  }
};
