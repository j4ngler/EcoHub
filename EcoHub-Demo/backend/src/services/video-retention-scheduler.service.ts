import cron, { type ScheduledTask } from 'node-cron';
import prisma from '../config/database';
import { deleteObject, decodeS3Key } from './s3.service';

let job: ScheduledTask | null = null;

// Giữ video 30 ngày kể từ lúc quay/tạo — chỉnh qua VIDEO_RETENTION_DAYS nếu cần khác.
const RETENTION_DAYS = Number.parseInt(process.env.VIDEO_RETENTION_DAYS || '30', 10) || 30;
// Chạy 1 lần/ngày lúc 2:30 sáng — giờ ít người dùng thao tác nhất.
const RETENTION_CRON = (process.env.VIDEO_RETENTION_CRON || '30 2 * * *').trim();

const PROXY_PREFIX = '/api/videos/storage/';

const extractS3Key = (url?: string | null): string | null => {
  if (!url) return null;
  const idx = url.indexOf(PROXY_PREFIX);
  if (idx === -1) return null; // URL cũ/khác định dạng — không rõ key, bỏ qua phần xóa S3.
  const encoded = url.slice(idx + PROXY_PREFIX.length).split(/[?#]/)[0];
  try {
    return decodeS3Key(decodeURIComponent(encoded));
  } catch {
    return null;
  }
};

const deleteKeysSafely = async (keys: Iterable<string>) => {
  for (const key of new Set(keys)) {
    try {
      await deleteObject(key);
    } catch (error) {
      console.warn(`[Video retention] Xóa object S3 thất bại (${key}):`, error instanceof Error ? error.message : error);
    }
  }
};

const purgeOldPackageVideos = async (cutoff: Date) => {
  const videos = await prisma.packageVideo.findMany({
    where: { deletedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, originalVideoUrl: true, processedVideoUrl: true },
  });

  for (const video of videos) {
    const keys = [extractS3Key(video.originalVideoUrl), extractS3Key(video.processedVideoUrl)].filter(
      (key): key is string => Boolean(key)
    );
    await deleteKeysSafely(keys);
    await prisma.packageVideo.update({ where: { id: video.id }, data: { deletedAt: new Date() } });
  }

  return videos.length;
};

const purgeOldReceivingVideos = async (cutoff: Date) => {
  const videos = await prisma.receivingVideo.findMany({
    where: { deletedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, videoUrl: true },
  });

  for (const video of videos) {
    const key = extractS3Key(video.videoUrl);
    if (key) await deleteKeysSafely([key]);
    await prisma.receivingVideo.update({ where: { id: video.id }, data: { deletedAt: new Date() } });
  }

  return videos.length;
};

const runVideoRetention = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const packagePurged = await purgeOldPackageVideos(cutoff);
  const receivingPurged = await purgeOldReceivingVideos(cutoff);
  if (packagePurged || receivingPurged) {
    console.log(
      `[Video retention] Đã xóa ${packagePurged} video đóng gói, ${receivingPurged} video mở hàng quá ${RETENTION_DAYS} ngày.`
    );
  }
};

export const startVideoRetentionScheduler = () => {
  if (job || process.env.VIDEO_RETENTION_ENABLED === 'false') return job;

  job = cron.schedule(RETENTION_CRON, () => {
    runVideoRetention().catch((error) => console.error('[Video retention] Job failed:', error));
  });

  return job;
};
