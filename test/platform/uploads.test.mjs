import 'reflect-metadata';
import { it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  FlashcardDto,
  UpdateFlashcardDto,
} from '../../dist/admin-learning-tools/admin-learning-tools.dto.js';
import { StorageService } from '../../dist/platform/storage.service.js';

it.each([undefined, null, '', '   '])(
  'accepts optional flashcard audio: %s',
  async (audioUrl) => {
    const dto = plainToInstance(FlashcardDto, {
      frontText: 'Front',
      backText: 'Back',
      ...(audioUrl === undefined ? {} : { audioUrl }),
    });
    expect(await validate(dto)).toHaveLength(0);
    if (typeof audioUrl === 'string') expect(dto.audioUrl).toBeNull();
  },
);
it('allows clearing existing audio and still rejects invalid URLs', async () => {
  const cleared = plainToInstance(UpdateFlashcardDto, { audioUrl: '' });
  expect(await validate(cleared)).toHaveLength(0);
  expect(cleared.audioUrl).toBeNull();
  const invalid = plainToInstance(FlashcardDto, {
    frontText: 'Front',
    backText: 'Back',
    audioUrl: 'not-a-url',
  });
  expect((await validate(invalid)).map((e) => e.property)).toContain(
    'audioUrl',
  );
});
it.each(['', 'http://localhost:9000'])('signs browser URLs with public endpoint %s without an empty-body checksum', async (publicEndpoint) => {
  const vars = {
    S3_ENDPOINT: 'http://minio:9000',
    S3_PUBLIC_URL: publicEndpoint,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'test-key',
    S3_SECRET_KEY: 'test-secret',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET_VIDEOS: 'videos',
  };
  const before = Object.fromEntries(
    Object.keys(vars).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, vars);
  const storage = new StorageService();
  try {
    const url = new URL(
      await storage.putUrl('VIDEOS', 'video.mp4', 'video/mp4'),
    );
    expect(url.host).toBe(publicEndpoint ? 'localhost:9000' : 'minio:9000');
    const download = new URL(await storage.get('VIDEOS', 'video.mp4'));
    expect(download.host).toBe(url.host);
    expect(download.searchParams.has('X-Amz-Signature')).toBe(true);
    expect(url.pathname).toBe('/videos/video.mp4');
    expect(url.searchParams.has('x-amz-checksum-crc32')).toBe(false);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain(
      'content-type',
    );
  } finally {
    storage.onModuleDestroy();
    for (const [key, value] of Object.entries(before))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
