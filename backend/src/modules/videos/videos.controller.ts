import { Request, Response, NextFunction } from 'express';
import * as videoService from './videos.service';
import { success, created, paginated, noContent } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const getVideos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoService.getVideos({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      search: req.query.search as string,
      orderId: req.query.orderId as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
      showDeleted: req.query.showDeleted === 'true' || req.query.showDeleted === true,
    }, req.user);
    
    paginated(res, result.videos, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getVideoById = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const video = await videoService.getVideoById(req.params.id, req.user);
    success(res, video);
  } catch (error) {
    next(error);
  }
};

export const getVideoByTrackingCode = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const videos = await videoService.getVideoByTrackingCode(req.params.trackingCode);
    success(res, videos);
  } catch (error) {
    next(error);
  }
};

export const getVideosByOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const videos = await videoService.getVideosByOrder(req.params.orderId, req.user);
    success(res, videos);
  } catch (error) {
    next(error);
  }
};

export const uploadPackageVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Vui lòng upload video' });
    }

    const video = await videoService.uploadPackageVideo({
      orderId: req.body.orderId,
      trackingCode: req.body.trackingCode,
      file,
      recordedBy: req.user!.userId,
      trackingCodePosition: req.body.trackingCodePosition,
    });

    created(res, video, 'Upload video thành công');
  } catch (error) {
    next(error);
  }
};

export const approveVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const video = await videoService.approveVideo(req.params.id, req.user!.userId);
    success(res, video, 'Phê duyệt video thành công');
  } catch (error) {
    next(error);
  }
};

export const deleteVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await videoService.deleteVideo(req.params.id);
    noContent(res);
  } catch (error) {
    next(error);
  }
};

export const uploadReceivingVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'Vui lòng upload video' });
    }

    const video = await videoService.uploadReceivingVideo({
      orderId: req.body.orderId,
      trackingCode: req.body.trackingCode,
      file,
      customerId: req.user!.userId,
    });

    created(res, video, 'Upload video nhận hàng thành công');
  } catch (error) {
    next(error);
  }
};

export const compareVideos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const comparison = await videoService.compareVideos(req.params.id);
    success(res, comparison);
  } catch (error) {
    next(error);
  }
};
