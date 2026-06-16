import { NextFunction, Response } from 'express';
import * as videoService from './videos.service';
import * as videoS3Service from './videos.s3.service';
import { decodeS3Key, getPresignedGetUrl } from '../../services/s3.service';
import { created, noContent, paginated, success } from '../../utils/response';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const streamStoredVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const key = decodeS3Key(req.params.encodedKey);
    const presigned = await getPresignedGetUrl({ key, expiresInSeconds: 900 });
    res.redirect(presigned.url);
  } catch (error) {
    next(error);
  }
};

export const getVideos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoService.getVideos(
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string,
        orderId: req.query.orderId as string,
        status: req.query.status as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
        showDeleted: req.query.showDeleted === 'true',
      },
      req.user
    );

    paginated(res, result.videos, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getReceivingVideos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoService.getReceivingVideos(
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string,
        orderId: req.query.orderId as string,
        comparisonStatus: req.query.comparisonStatus as string,
      },
      req.user
    );

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
      return res.status(400).json({ success: false, message: 'Vui long upload video' });
    }

    const video = await videoService.uploadPackageVideo({
      orderId: req.body.orderId,
      trackingCode: req.body.trackingCode,
      file,
      recordedBy: req.user!.userId,
      trackingCodePosition: req.body.trackingCodePosition,
    });

    created(res, video, 'Upload video thanh cong');
  } catch (error) {
    next(error);
  }
};

export const approveVideo = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const video = await videoService.approveVideo(req.params.id, req.user!.userId);
    success(res, video, 'Phe duyet video thanh cong');
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
      return res.status(400).json({ success: false, message: 'Vui long upload video' });
    }

    const video = await videoService.uploadReceivingVideo({
      orderId: req.body.orderId,
      trackingCode: req.body.trackingCode,
      file,
      customerId: req.user!.userId,
    });

    created(res, video, 'Upload video nhan hang thanh cong');
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

export const initS3Upload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoS3Service.initUpload(
      {
        orderId: req.body.orderId,
        module: req.body.module,
        contentType: req.body.contentType,
        fileName: req.body.fileName,
        sizeBytes: req.body.sizeBytes,
      },
      req.user && {
        userId: req.user.userId,
        // @ts-ignore JWT roles map to RoleName[] here.
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );

    created(res, result, 'Khoi tao upload video S3 thanh cong');
  } catch (error) {
    next(error);
  }
};

export const completeS3Upload = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoS3Service.completeUpload(
      {
        videoId: req.body.videoId,
        sizeBytes: req.body.sizeBytes,
        durationSec: req.body.durationSec,
        success: req.body.success,
        errorCode: req.body.errorCode,
        errorMessage: req.body.errorMessage,
      },
      req.user && {
        userId: req.user.userId,
        // @ts-ignore JWT roles map to RoleName[] here.
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );

    success(res, result, 'Xac nhan upload video S3 thanh cong');
  } catch (error) {
    next(error);
  }
};

export const listS3Videos = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoS3Service.listVideos(
      {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        shopId: (req.query.shopId as string) || undefined,
        uploaderUserId: (req.query.uploaderUserId as string) || undefined,
        orderId: (req.query.orderId as string) || undefined,
        module: (req.query.module as string) || undefined,
        status: (req.query.status as string) || undefined,
        startDate: (req.query.startDate as string) || undefined,
        endDate: (req.query.endDate as string) || undefined,
      },
      req.user && {
        userId: req.user.userId,
        // @ts-ignore JWT roles map to RoleName[] here.
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );

    paginated(res, result.videos, result.total, result.page, result.limit);
  } catch (error) {
    next(error);
  }
};

export const getS3VideoViewUrl = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await videoS3Service.getVideoViewUrl(
      req.params.videoId,
      req.user && {
        userId: req.user.userId,
        // @ts-ignore JWT roles map to RoleName[] here.
        roles: req.user.roles,
        shopId: req.user.shopId ?? null,
      }
    );

    success(res, result);
  } catch (error) {
    next(error);
  }
};
