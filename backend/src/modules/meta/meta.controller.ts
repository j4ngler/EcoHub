import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { success } from '../../utils/response';
import * as metaService from './meta.service';

export const getRoles = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const roles = await metaService.getRoles();
    success(res, roles);
  } catch (error) {
    console.error('[getRoles]', error);
    success(res, []);
  }
};

export const getShops = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const shops = await metaService.getShops();
    success(res, shops);
  } catch (error) {
    console.error('[getShops]', error);
    success(res, []);
  }
};

