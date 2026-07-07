import { env } from '../config/environment';
import fs from 'fs/promises';

// Load AWS SDK lazily so the backend can still boot even when S3 is not configured.
let AwsS3ClientClass: any;
let AwsPutObjectCommandClass: any;
let AwsGetObjectCommandClass: any;
let AwsHeadObjectCommandClass: any;
let AwsDeleteObjectCommandClass: any;
let awsGetSignedUrlFn: any;
let awsSdkLoaded = false;

const ensureAwsSdk = async () => {
  if (awsSdkLoaded) return;

  try {
    const s3Module = await import('@aws-sdk/client-s3');
    const presignerModule = await import('@aws-sdk/s3-request-presigner');

    AwsS3ClientClass = (s3Module as any).S3Client;
    AwsPutObjectCommandClass = (s3Module as any).PutObjectCommand;
    AwsGetObjectCommandClass = (s3Module as any).GetObjectCommand;
    AwsHeadObjectCommandClass = (s3Module as any).HeadObjectCommand;
    AwsDeleteObjectCommandClass = (s3Module as any).DeleteObjectCommand;
    awsGetSignedUrlFn = (presignerModule as any).getSignedUrl;
    awsSdkLoaded = true;
  } catch (err: any) {
    console.error('[S3] AWS SDK import failed:', err?.message || err);
    throw new Error(
      'AWS SDK for S3 chưa được cài đặt. Vui lòng chạy: npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner trong backend.'
    );
  }
};

let s3Client: any = null;

const getS3Client = async () => {
  await ensureAwsSdk();

  if (!s3Client) {
    const hasStaticCredentials = !!env.AWS_ACCESS_KEY_ID && !!env.AWS_SECRET_ACCESS_KEY;
    const endpoint = env.AWS_S3_ENDPOINT?.trim() || undefined;

    s3Client = new AwsS3ClientClass({
      region: env.AWS_REGION,
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
          }
        : {}),
      ...(hasStaticCredentials
        ? {
            credentials: {
              accessKeyId: env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
            },
          }
        : {}),
    });
  }

  return s3Client;
};

export const getS3Bucket = () => {
  if (!env.AWS_S3_BUCKET) {
    throw new Error('AWS_S3_BUCKET chưa được cấu hình trong biến môi trường');
  }

  return env.AWS_S3_BUCKET;
};

export const getPresignedPutUrl = async (params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  const command = new AwsPutObjectCommandClass({
    Bucket: bucket,
    Key: params.key,
    ContentType: params.contentType,
  });

  const url = await awsGetSignedUrlFn(client, command, {
    expiresIn: params.expiresInSeconds ?? 900,
  });

  return { url, bucket, key: params.key };
};

export const getPresignedGetUrl = async (params: {
  key: string;
  expiresInSeconds?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  const command = new AwsGetObjectCommandClass({
    Bucket: bucket,
    Key: params.key,
    ...(params.responseContentDisposition
      ? { ResponseContentDisposition: params.responseContentDisposition }
      : {}),
    ...(params.responseContentType ? { ResponseContentType: params.responseContentType } : {}),
  });

  const url = await awsGetSignedUrlFn(client, command, {
    expiresIn: params.expiresInSeconds ?? 3600,
  });

  return { url, bucket, key: params.key };
};

export const uploadFileToS3 = async (params: {
  key: string;
  filePath: string;
  contentType: string;
}) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();
  const body = await fs.readFile(params.filePath);

  await client.send(
    new AwsPutObjectCommandClass({
      Bucket: bucket,
      Key: params.key,
      Body: body,
      ContentType: params.contentType,
      ContentLength: body.length,
    })
  );

  return { bucket, key: params.key };
};

export const encodeS3Key = (key: string) => Buffer.from(key, 'utf8').toString('base64url');

export const decodeS3Key = (encodedKey: string) => Buffer.from(encodedKey, 'base64url').toString('utf8');

export const getS3ProxyUrl = (key: string) => `/api/videos/storage/${encodeS3Key(key)}`;

export const deleteObject = async (key: string) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  try {
    await client.send(
      new AwsDeleteObjectCommandClass({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error: any) {
    // Vật thể không tồn tại thì coi như đã xóa xong, không cần báo lỗi.
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return;
    throw error;
  }
};

export const headObject = async (key: string) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  try {
    return await client.send(
      new AwsHeadObjectCommandClass({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return null;
    }

    throw error;
  }
};
