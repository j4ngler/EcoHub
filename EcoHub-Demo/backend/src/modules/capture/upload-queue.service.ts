import fs from 'fs/promises';
import path from 'path';
import * as videoService from '../videos/videos.service';

type QueueModule = 'packaging' | 'receiving';
type QueueStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

type UploadQueueJob = {
  id: string;
  userId: string;
  orderId: string;
  trackingCode: string;
  module: QueueModule;
  filePath: string;
  originalName: string;
  createdAt: string;
  updatedAt: string;
  status: QueueStatus;
  error: string | null;
  result: unknown;
};

const jobs = new Map<string, UploadQueueJob>();
const queue: string[] = [];
let processing = false;

const queueDir = path.resolve(process.cwd(), 'uploads', 'rtsp-recordings');
const RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const stamp = () => new Date().toISOString();

const buildRecordedFile = async (filePath: string, originalName: string) => {
  const stats = await fs.stat(filePath);
  const filename = path.basename(filePath);
  return {
    fieldname: 'video',
    originalname: originalName || filename,
    encoding: '7bit',
    mimetype: 'video/mp4',
    destination: path.dirname(filePath),
    filename,
    path: filePath,
    size: stats.size,
  } as Express.Multer.File;
};

const processQueue = async () => {
  if (processing) return;
  processing = true;

  while (queue.length) {
    const jobId = queue.shift()!;
    const job = jobs.get(jobId);
    if (!job || job.status !== 'queued') continue;

    job.status = 'processing';
    job.updatedAt = stamp();

    try {
      const file = await buildRecordedFile(job.filePath, job.originalName);
      if (job.module === 'receiving') {
        job.result = await videoService.uploadReceivingVideo({
          orderId: job.orderId,
          trackingCode: job.trackingCode,
          file,
          customerId: job.userId,
        });
      } else {
        job.result = await videoService.uploadPackageVideo({
          orderId: job.orderId,
          trackingCode: job.trackingCode,
          file,
          recordedBy: job.userId,
          trackingCodePosition: 'bottom_right',
        });
      }

      job.status = 'completed';
      job.updatedAt = stamp();
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = stamp();
    }
  }

  processing = false;
};

const cleanupQueueDir = async () => {
  try {
    await fs.mkdir(queueDir, { recursive: true });
    const entries = await fs.readdir(queueDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(queueDir, entry.name);
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs > RETENTION_MS) {
        await fs.unlink(fullPath).catch(() => undefined);
      }
    }
  } catch {
    // Best effort cleanup only.
  }

  for (const [jobId, job] of jobs.entries()) {
    const updatedAtMs = new Date(job.updatedAt).getTime();
    if (
      Number.isFinite(updatedAtMs) &&
      Date.now() - updatedAtMs > RETENTION_MS &&
      ['completed', 'failed', 'cancelled'].includes(job.status)
    ) {
      jobs.delete(jobId);
    }
  }
};

setInterval(() => {
  void cleanupQueueDir();
}, CLEANUP_INTERVAL_MS).unref?.();

export const enqueueUpload = async (params: {
  userId: string;
  orderId: string;
  trackingCode: string;
  module: QueueModule;
  filePath: string;
  originalName: string;
}) => {
  const id = `queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const job: UploadQueueJob = {
    id,
    userId: params.userId,
    orderId: params.orderId,
    trackingCode: params.trackingCode,
    module: params.module,
    filePath: params.filePath,
    originalName: params.originalName,
    createdAt: stamp(),
    updatedAt: stamp(),
    status: 'queued',
    error: null,
    result: null,
  };

  jobs.set(id, job);
  queue.push(id);
  void processQueue();

  return job;
};

export const cancelQueuedJob = async (jobId: string) => {
  const job = jobs.get(jobId);
  if (!job) return null;
  if (job.status === 'processing' || job.status === 'completed') return job;

  job.status = 'cancelled';
  job.updatedAt = stamp();
  const idx = queue.indexOf(jobId);
  if (idx >= 0) queue.splice(idx, 1);
  await fs.unlink(job.filePath).catch(() => undefined);
  return job;
};

export const getQueueStatus = () => {
  const records = Array.from(jobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map((job) => ({
      id: job.id,
      tracking_code: job.trackingCode,
      status: job.status,
      error: job.error,
      module: job.module,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
      file_name: path.basename(job.filePath),
      result: job.result,
    }));

  return {
    queue: records,
    total: records.length,
    processing,
    source: 'server-local',
  };
};

export const forceCleanup = async () => {
  await cleanupQueueDir();
  return { ok: true };
};
