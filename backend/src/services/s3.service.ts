import { env } from '../config/environment';

// Để tránh backend crash khi chưa cài AWS SDK,
// ta dùng dynamic import thay vì import statically ở top-level.
// Khi chưa cài package, chỉ các API S3 mới lỗi, còn toàn bộ hệ thống vẫn chạy.

let AwsS3ClientClass: any;
let AwsPutObjectCommandClass: any;
let AwsGetObjectCommandClass: any;
let AwsHeadObjectCommandClass: any;
let awsGetSignedUrlFn: any;
let awsSdkLoaded = false;
let awsSdkLoadError: Error | null = null;

const ensureAwsSdk = async () => {
  if (awsSdkLoaded) return;
  try {
    const s3Module = await import('@aws-sdk/client-s3');
    const presignerModule = await import('@aws-sdk/s3-request-presigner');

    AwsS3ClientClass = (s3Module as any).S3Client;
    AwsPutObjectCommandClass = (s3Module as any).PutObjectCommand;
    AwsGetObjectCommandClass = (s3Module as any).GetObjectCommand;
    AwsHeadObjectCommandClass = (s3Module as any).HeadObjectCommand;
    awsGetSignedUrlFn = (presignerModule as any).getSignedUrl;

    awsSdkLoaded = true;
    awsSdkLoadError = null;
  } catch (err: any) {
    awsSdkLoadError = err;
    console.error('[S3] AWS SDK chưa được cài đặt hoặc import lỗi:', err?.message || err);
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

    s3Client = new AwsS3ClientClass({
      region: env.AWS_REGION,
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
    expiresIn: params.expiresInSeconds ?? 900, // 15 phút
  });

  return { url, bucket, key: params.key };
};

export const getPresignedGetUrl = async (params: { key: string; expiresInSeconds?: number }) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  const command = new AwsGetObjectCommandClass({
    Bucket: bucket,
    Key: params.key,
  });

  const url = await awsGetSignedUrlFn(client, command, {
    expiresIn: params.expiresInSeconds ?? 3600, // 60 phút
  });

  return { url, bucket, key: params.key };
};

export const headObject = async (key: string) => {
  const client = await getS3Client();
  const bucket = getS3Bucket();

  try {
    const result = await client.send(
      new AwsHeadObjectCommandClass({
        Bucket: bucket,
        Key: key,
      })
    );

    return result;
  } catch (error: any) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return null;
    }
    throw error;
  }
};

