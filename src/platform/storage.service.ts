import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fail } from './common.js';
export type Bucket = 'VIDEOS' | 'MEDIA' | 'SLIPS';

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly signingClient: S3Client;

  constructor() {
    if (
      process.env.S3_FORCE_PATH_STYLE === 'true' &&
      !process.env.S3_ENDPOINT
    ) {
      fail(
        503,
        'STORAGE_NOT_CONFIGURED',
        'Set S3_ENDPOINT to the MinIO/S3-compatible API endpoint',
      );
    }
    if (!!process.env.S3_ACCESS_KEY !== !!process.env.S3_SECRET_KEY) {
      fail(
        503,
        'STORAGE_NOT_CONFIGURED',
        'S3_ACCESS_KEY and S3_SECRET_KEY must be configured together',
      );
    }
    const options = {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: process.env.S3_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY,
            secretAccessKey: process.env.S3_SECRET_KEY!,
          }
        : undefined,
      // A presigned PUT has no body yet. Do not sign the CRC32 of an empty body.
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      maxAttempts: 2,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 30000 },
    };
    this.client = new S3Client(options);
    this.signingClient = process.env.S3_PUBLIC_URL
      ? new S3Client({ ...options, endpoint: process.env.S3_PUBLIC_URL })
      : this.client;
  }

  bucket(type: Bucket) {
    return (
      process.env[`S3_BUCKET_${type}`] ||
      fail(503, 'STORAGE_NOT_CONFIGURED', `S3_BUCKET_${type} is required`)
    );
  }

  mediaUrl(key: string): Promise<string> {
    // Retain externally hosted URLs; our buckets remain private.
    return /^https?:\/\//.test(key)
      ? Promise.resolve(key)
      : this.get('MEDIA', key);
  }

  async get(type: Bucket, key: string) {
    try {
      return await getSignedUrl(
        this.signingClient,
        new GetObjectCommand({ Bucket: this.bucket(type), Key: key }),
        { expiresIn: 3600 },
      );
    } catch (error) {
      return this.storageError(error);
    }
  }

  async putUrl(type: Bucket, key: string, contentType: string) {
    try {
      return await getSignedUrl(
        this.signingClient,
        new PutObjectCommand({
          Bucket: this.bucket(type),
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: 900, signableHeaders: new Set(['content-type']) },
      );
    } catch (error) {
      return this.storageError(error);
    }
  }

  async put(type: Bucket, key: string, body: Buffer, contentType: string) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket(type),
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return key;
    } catch (error) {
      return this.storageError(error);
    }
  }

  async head(type: Bucket, key: string) {
    try {
      return await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket(type), Key: key }),
      );
    } catch (error) {
      const failure = error as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        failure.name !== 'NoSuchBucket' &&
        (failure.$metadata?.httpStatusCode === 404 ||
          failure.name === 'NotFound')
      ) {
        fail(400, 'OBJECT_NOT_FOUND', 'Upload the file before confirming it');
      }
      return this.storageError(error);
    }
  }

  async delete(type: Bucket, key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket(type), Key: key }),
      );
    } catch (error) {
      this.storageError(error);
    }
  }

  private storageError(error: unknown): never {
    const failure = error as {
      name?: string;
      code?: string;
      getStatus?: () => number;
    };
    if (typeof failure?.getStatus === 'function') throw error;
    const name = failure?.name;
    // Do not log signed URLs, request headers, credentials, or the raw SDK error.
    if (name === 'NoSuchBucket') {
      this.logger.error('Configured storage bucket does not exist');
      fail(
        503,
        'STORAGE_BUCKET_MISSING',
        'Storage bucket is missing; run npm run storage:init',
      );
    }
    if (
      ['AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(
        name ?? '',
      )
    ) {
      this.logger.error('Storage authentication failed');
      fail(
        503,
        'STORAGE_ACCESS_DENIED',
        'Storage credentials or permissions are not configured correctly',
      );
    }
    this.logger.error(
      'Storage request failed; check endpoint and service availability',
    );
    fail(
      503,
      'STORAGE_UNAVAILABLE',
      'Storage is unavailable; check S3_ENDPOINT and the storage service',
    );
  }

  onModuleDestroy() {
    this.client.destroy();
    if (this.signingClient !== this.client) this.signingClient.destroy();
  }
}
