import { Request, Response, NextFunction } from 'express';
import * as shippingService from './shipping.service';
import { success, created } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getCarriers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const carriers = await shippingService.getCarriers();
    success(res, carriers);
  } catch (error) {
    next(error);
  }
};

export const getCarrierById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const carrier = await shippingService.getCarrierById(req.params.id);
    success(res, carrier);
  } catch (error) {
    next(error);
  }
};

export const calculateFee = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const fees = await shippingService.calculateFee(req.body);
    success(res, fees);
  } catch (error) {
    next(error);
  }
};

export const trackShipment = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tracking = await shippingService.trackShipment(req.params.trackingCode);
    success(res, tracking);
  } catch (error) {
    next(error);
  }
};

export const getShopCarrierSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const settings = await shippingService.getShopCarrierSettings(req.params.shopId);
    success(res, settings);
  } catch (error) {
    next(error);
  }
};

export const saveShopCarrierSetting = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const setting = await shippingService.saveShopCarrierSetting(req.body);
    created(res, setting, 'Lưu cài đặt thành công');
  } catch (error) {
    next(error);
  }
};
