import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { env } from '../../config/environment';

type CompressionResult = {
  processedVideoUrl: string;
  processedVideoSize: number;
  durationSec?: number | null;
  processingError?: string | null;
  compressed: boolean;
};

type PythonCompressionPayload = {
  output_path?: string;
  size_bytes?: number;
  duration_sec?: number | null;
};

type VideoProbeInfo = {
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
};

type CompressionOptions = {
  targetSizeMb?: number;
  targetFps?: number;
  maxWidth?: number;
};

const resolveExistingPath = (...candidates: string[]) => {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(candidates[0]);
};

const getCompressionScriptPath = () =>
  resolveExistingPath(
    path.join(process.cwd(), 'backend', 'scripts', 'compress_video.py'),
    path.join(process.cwd(), 'scripts', 'compress_video.py')
  );

const getFfmpegPath = () => env.FFMPEG_PATH || (process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const getFfprobePath = () => env.FFPROBE_PATH || (process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

const toUploadsUrl = (absolutePath: string) => {
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');
  const relative = path.relative(uploadsRoot, absolutePath).replace(/\\/g, '/');
  return `/uploads/${relative}`;
};

const runBinary = async (command: string, args: string[]) => {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
};

const probeVideo = async (inputPath: string): Promise<VideoProbeInfo | null> => {
  try {
    const result = await runBinary(getFfprobePath(), [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_streams',
      '-show_format',
      inputPath,
    ]);

    if (result.code !== 0) return null;

    const parsed = JSON.parse(result.stdout || '{}');
    const videoStream = Array.isArray(parsed.streams)
      ? parsed.streams.find((stream: any) => stream.codec_type === 'video')
      : null;

    const rawRate = String(videoStream?.avg_frame_rate || videoStream?.r_frame_rate || '');
    let fps: number | null = null;
    if (rawRate.includes('/')) {
      const [num, den] = rawRate.split('/').map(Number);
      if (num > 0 && den > 0) fps = num / den;
    }

    return {
      durationSec: Number(parsed?.format?.duration || 0) || null,
      width: Number(videoStream?.width || 0) || null,
      height: Number(videoStream?.height || 0) || null,
      fps,
    };
  } catch {
    return null;
  }
};

const buildScaleFilter = (probe: VideoProbeInfo | null, maxWidth?: number) => {
  if (maxWidth && maxWidth > 0) {
    return `scale='min(${maxWidth},iw)':-2`;
  }

  const width = probe?.width || 1280;
  if (width >= 1600) return 'scale=1280:-2';
  if (width >= 1200) return 'scale=960:-2';
  if (width >= 900) return 'scale=854:-2';
  return 'scale=640:-2';
};

const buildTargetFps = (probe: VideoProbeInfo | null, targetFps?: number) => {
  if (targetFps && targetFps > 0) {
    return targetFps;
  }

  const fps = probe?.fps || 24;
  if (fps > 20) return 15;
  if (fps > 12) return 12;
  return Math.max(8, Math.round(fps));
};

const computeTargetVideoBitrateKbps = (durationSec: number | null, targetSizeMb: number) => {
  if (!durationSec || durationSec <= 0) return 650;

  const targetSizeBytes = targetSizeMb * 1024 * 1024;
  const bitsPerSecond = (targetSizeBytes * 8) / durationSec;
  const budgetKbps = Math.floor((bitsPerSecond / 1000) * 0.92);
  return Math.max(300, Math.min(1600, budgetKbps));
};

const runFfmpegCompression = async (
  inputPath: string,
  outputPath: string,
  targetSizeMb: number,
  options: CompressionOptions = {}
): Promise<PythonCompressionPayload> => {
  const probe = await probeVideo(inputPath);
  const targetFps = buildTargetFps(probe, options.targetFps);
  const scaleFilter = buildScaleFilter(probe, options.maxWidth);
  const bitrateKbps = computeTargetVideoBitrateKbps(probe?.durationSec || null, targetSizeMb);

  const result = await runBinary(getFfmpegPath(), [
    '-y',
    '-i',
    inputPath,
    '-an',
    '-vf',
    scaleFilter,
    '-r',
    String(targetFps),
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '33',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]);

  if (result.code !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `ffmpeg exited with code ${result.code}`);
  }

  const outputStats = await fs.stat(outputPath);
  return {
    output_path: outputPath,
    size_bytes: outputStats.size,
    duration_sec: probe?.durationSec ? Math.ceil(probe.durationSec) : null,
  };
};

const runPythonCompression = async (
  inputPath: string,
  outputPath: string,
  targetSizeMb: number
): Promise<PythonCompressionPayload> => {
  const scriptPath = getCompressionScriptPath();

  return new Promise((resolve, reject) => {
    const child = spawn(
      env.VIDEO_COMPRESSION_PYTHON,
      [
        scriptPath,
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--target-size-mb',
        String(targetSizeMb),
      ],
      {
        cwd: process.cwd(),
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Video compression exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(
          new Error(`Invalid compression output: ${(error as Error).message}. Raw: ${stdout.trim() || stderr.trim()}`)
        );
      }
    });
  });
};

export const compressVideoFile = async (
  filePath: string,
  options: CompressionOptions = {}
): Promise<{
  outputPath: string;
  sizeBytes: number;
  durationSec?: number | null;
  processingError?: string | null;
  compressed: boolean;
}> => {
  const originalStats = await fs.stat(filePath);
  const targetSizeMb = Number(options.targetSizeMb ?? env.VIDEO_TARGET_SIZE_MB ?? '4');
  const normalizedTargetSizeMb = Number.isFinite(targetSizeMb) ? targetSizeMb : 4;

  const processedDir = path.resolve(process.cwd(), 'uploads', 'processed');
  const parsed = path.parse(filePath);
  const outputPath = path.join(processedDir, `${parsed.name}-compressed.mp4`);
  await fs.mkdir(processedDir, { recursive: true });

  try {
    let result: PythonCompressionPayload;

    try {
      result = await runFfmpegCompression(filePath, outputPath, normalizedTargetSizeMb, options);
    } catch {
      result = await runPythonCompression(filePath, outputPath, normalizedTargetSizeMb);
    }

    const outputStats = await fs.stat(outputPath);
    const processedSize = Number(result.size_bytes || outputStats.size);

    if (!processedSize || processedSize >= originalStats.size) {
      await fs.rm(outputPath, { force: true });
      return {
        outputPath: filePath,
        sizeBytes: originalStats.size,
        durationSec: result.duration_sec ?? null,
        processingError: processedSize ? 'Compressed file is not smaller than original, using original file.' : null,
        compressed: false,
      };
    }

    return {
      outputPath: result.output_path || outputPath,
      sizeBytes: processedSize,
      durationSec: result.duration_sec ?? null,
      processingError: null,
      compressed: true,
    };
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => undefined);
    return {
      outputPath: filePath,
      sizeBytes: originalStats.size,
      durationSec: null,
      processingError: (error as Error).message,
      compressed: false,
    };
  }
};

export const compressUploadedVideo = async (file: Express.Multer.File): Promise<CompressionResult> => {
  const originalUrl = `/uploads/${file.filename}`;
  const compressed = await compressVideoFile(file.path);

  return {
    processedVideoUrl: compressed.compressed ? toUploadsUrl(compressed.outputPath) : originalUrl,
    processedVideoSize: compressed.sizeBytes,
    durationSec: compressed.durationSec ?? null,
    processingError: compressed.processingError ?? null,
    compressed: compressed.compressed,
  };
};
