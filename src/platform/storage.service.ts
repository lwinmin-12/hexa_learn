import {Injectable, OnModuleDestroy} from '@nestjs/common';
import {S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {fail} from './common.js';
export type Bucket = 'VIDEOS' | 'MEDIA' | 'SLIPS';
@Injectable()
export class StorageService implements OnModuleDestroy {
  private client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: process.env.S3_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY ?? '',
        }
      : undefined,
  });
  bucket(type: Bucket) {
    return (
      process.env[`S3_BUCKET_${type}`] ??
      fail(503, 'STORAGE_NOT_CONFIGURED', `S3_BUCKET_${type} is required`)
    );
  }
  mediaUrl(key: string): Promise<string> {
    if (/^https?:\/\//.test(key)) return Promise.resolve(key);
    const base = process.env.S3_PUBLIC_URL;
    if (base) return Promise.resolve(`${base.replace(/\/$/, '')}/${this.bucket('MEDIA')}/${key.split('/').map(encodeURIComponent).join('/')}`);
    return this.get('MEDIA', key);
  }
  get(type: Bucket, key: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket(type), Key: key }),
      { expiresIn: 3600 },
    );
  }
  putUrl(type: Bucket, key: string, contentType: string) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket(type),
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 900 },
    );
  }
  async put(type: Bucket, key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(type),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return key;
  }
  async head(type: Bucket, key: string) {
    try {
      return await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket(type), Key: key }),
      );
    } catch {
      return fail(400, 'OBJECT_NOT_FOUND', 'Uploaded object not found');
    }
  }
  async delete(type: Bucket, key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket(type), Key: key }),
    );
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
