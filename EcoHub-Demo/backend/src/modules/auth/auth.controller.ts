import { NextFunction, Request, Response } from 'express';
import { created, success } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as authService from './auth.service';

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.register(req.body);
    created(res, result, 'Đăng ký thành công');
  } catch (error) {
    next(error);
  }
};

export const getRegisterOptions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await authService.getRegisterOptions();
    success(res, result);
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { loginId, email, password } = req.body;
    const result = await authService.login(loginId || email, password);
    success(res, result, 'Đăng nhập thành công');
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    success(res, null, 'Đăng xuất thành công');
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshToken(refreshToken);
    success(res, result, 'Làm mới token thành công');
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await authService.getMe(req.user!.userId, req.user?.shopId ?? null);
    success(res, user);
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await authService.updateMe(req.user!.userId, req.body);
    success(res, user, 'Cập nhật thông tin thành công');
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    success(res, null, 'Đổi mật khẩu thành công');
  } catch (error) {
    next(error);
  }
};

export const assumeShop = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await authService.assumeShop(req.user!.userId, req.body?.shopId ?? null);
    success(res, result, 'Đã chuyển quyền quản lý shop');
  } catch (error) {
    next(error);
  }
};
