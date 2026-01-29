import { Router } from 'express';
import * as videoController from './videos.controller';
import { validate } from '../../middlewares/validation.middleware';
import { authenticate, authorizePermission } from '../../middlewares/auth.middleware';
import { uploadVideo } from '../../middlewares/upload.middleware';
import { queryVideosSchema, uploadVideoSchema } from './videos.dto';

const router = Router();

router.use(authenticate);

// List videos
router.get('/', authorizePermission('videos.view'), validate(queryVideosSchema), videoController.getVideos);

// Get video by ID
router.get('/:id', authorizePermission('videos.view'), videoController.getVideoById);

// Get video by tracking code (for customers)
router.get('/tracking/:trackingCode', videoController.getVideoByTrackingCode);

// Get videos by order
router.get('/order/:orderId', authorizePermission('videos.view'), videoController.getVideosByOrder);

// Upload package video
router.post(
  '/upload',
  authorizePermission('videos.upload'),
  uploadVideo,
  validate(uploadVideoSchema),
  videoController.uploadPackageVideo
);

// Approve video
router.put('/:id/approve', authorizePermission('videos.approve'), videoController.approveVideo);

// Delete video
router.delete('/:id', authorizePermission('videos.delete'), videoController.deleteVideo);

// Upload receiving video (customer)
router.post('/receiving/upload', uploadVideo, videoController.uploadReceivingVideo);

// Compare videos
router.get('/:id/compare', authorizePermission('videos.view'), videoController.compareVideos);

export default router;
