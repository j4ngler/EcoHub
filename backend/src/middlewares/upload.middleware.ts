import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { badRequest } from './error.middleware';

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Allow videos
  if (file.fieldname === 'video') {
    const allowedMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file video (MP4, WebM, MOV, AVI)'));
    }
  }
  // Allow images
  else if (file.fieldname === 'image' || file.fieldname === 'images') {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (JPEG, PNG, GIF, WebP)'));
    }
  } else {
    cb(null, true);
  }
};

// Upload configurations
export const uploadVideo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max for videos
  },
}).single('video');

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max for images
  },
}).single('image');

export const uploadImages = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per image
  },
}).array('images', 10); // Max 10 images
