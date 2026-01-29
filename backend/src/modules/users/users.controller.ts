import { Request, Response, NextFunction } from 'express';
import * as userService from './users.service';
import { success, created, paginated, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await userService.getUsers({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      search: search as string,
      role: role as string,
      status: status as string,
    }, req.user);
    
    paginated(res, result.users, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
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
    const user = await userService.createUser(req.body, req.user!.userId, req.user);
    created(res, user, 'Tạo người dùng thành công');
  } catch (error) {
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
    await userService.deleteUser(req.params.id);
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
