import { Router } from 'express';
import { RoleName } from '@prisma/client';
import * as captureController from './capture.controller';
import { authenticate, authorize, authorizePermission } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validation.middleware';
import { prepareUploadSchema } from './capture.dto';

const router = Router();

router.use(authenticate);

router.get(
  '/barcode-mappings',
  authorizePermission('videos.upload'),
  captureController.listBarcodeMappings
);
router.post(
  '/barcode-mappings',
  authorize(RoleName.super_admin, RoleName.admin),
  captureController.createBarcodeMapping
);
router.put(
  '/barcode-mappings/:id',
  authorize(RoleName.super_admin, RoleName.admin),
  captureController.updateBarcodeMapping
);
router.delete(
  '/barcode-mappings/:id',
  authorize(RoleName.super_admin, RoleName.admin),
  captureController.deleteBarcodeMapping
);

router.get('/service-info', authorizePermission('settings.view'), captureController.serviceInfo);
router.get('/health', authorizePermission('videos.view'), captureController.health);
router.get('/runtime-status', authorizePermission('videos.view'), captureController.runtimeStatus);
router.get('/camera-status', authorizePermission('videos.view'), captureController.cameraStatus);
router.get('/upload-status', authorizePermission('videos.view'), captureController.uploadStatus);
router.get('/video-storage-usage', authorizePermission('videos.view'), captureController.videoStorageUsage);
router.get('/recording-flow', authorizePermission('videos.view'), captureController.getRecordingFlow);
router.get('/active-session', authorizePermission('videos.view'), captureController.activeUploadSession);
router.get('/rtsp-preview', authorizePermission('videos.view'), captureController.rtspPreview);

router.post(
  '/prepare-upload',
  authorizePermission('videos.upload'),
  validate(prepareUploadSchema),
  captureController.prepareUpload
);
router.post(
  '/prepare-upload-flow',
  authorizePermission('videos.upload'),
  validate(prepareUploadSchema),
  captureController.prepareUploadFlow
);
router.post('/recording-flow', authorizePermission('videos.upload'), captureController.setRecordingFlow);
router.post('/manual-scan', authorizePermission('videos.upload'), captureController.manualScan);
router.post('/manual-order', authorizePermission('videos.upload'), captureController.manualOrder);
router.post('/start-cameras', authorizePermission('videos.upload'), captureController.startCameras);
router.post('/test-camera', authorizePermission('videos.upload'), captureController.testCamera);
router.post('/stop-cameras', authorizePermission('videos.upload'), captureController.stopCameras);
router.post('/start-recording', authorizePermission('videos.upload'), captureController.startRecording);
router.post('/stop-recording', authorizePermission('videos.upload'), captureController.stopRecording);
router.post('/pause-recording', authorizePermission('videos.upload'), captureController.pauseRecording);
router.post('/resume-recording', authorizePermission('videos.upload'), captureController.resumeRecording);
router.post('/cancel-recording', authorizePermission('videos.upload'), captureController.cancelRecording);
router.post('/cleanup-uploads', authorizePermission('videos.upload'), captureController.cleanupUploads);
router.post('/reset-order', authorizePermission('videos.upload'), captureController.resetOrder);
router.delete('/active-session', authorizePermission('videos.upload'), captureController.clearUploadSession);

export default router;
