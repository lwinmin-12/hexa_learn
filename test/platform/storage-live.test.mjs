import 'dotenv/config';
import { it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from '../../dist/platform/storage.service.js';
const live = process.env.RUN_STORAGE_TESTS === '1' ? it : it.skip;
live(
  'uploads, confirms and reads private media, slips and browser PUT videos in MinIO',
  async () => {
    const storage = new StorageService();
    const origin = (process.env.S3_CORS_ORIGINS ?? process.env.DASHBOARD_ORIGINS ?? 'http://localhost:5173').split(',')[0].trim();
    const prefix = `integration-tests/${randomUUID()}`;
    const created = [];
    try {
      for (const [bucket, ext, type] of [
        ['MEDIA', 'png', 'image/png'],
        ['MEDIA', 'mp3', 'audio/mpeg'],
        ['SLIPS', 'png', 'image/png'],
      ]) {
        const key = `${prefix}/file.${ext}`;
        const bytes = Buffer.from(`Non-empty ${bucket} ${type} upload`);
        await storage.put(bucket, key, bytes, type);
        created.push([bucket, key]);
        expect((await storage.head(bucket, key)).ContentLength).toBe(
          bytes.length,
        );
        const get = await fetch(await storage.get(bucket, key));
        expect(get.status).toBe(200);
        expect(Buffer.from(await get.arrayBuffer())).toEqual(bytes);
      }
      const key = `${prefix}/video.mp4`,
        bytes = Buffer.from('non-empty browser video upload');
      const signed = await storage.putUrl('VIDEOS', key, 'video/mp4');
      const preflight = await fetch(signed, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      expect(preflight.status).toBeLessThan(400);
      expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
      const uploaded = await fetch(signed, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: bytes,
      });
      expect(uploaded.status).toBe(200);
      created.push(['VIDEOS', key]);
      expect((await storage.head('VIDEOS', key)).ContentLength).toBe(
        bytes.length,
      );
      const get = await fetch(await storage.get('VIDEOS', key));
      expect(get.status).toBe(200);
      expect(Buffer.from(await get.arrayBuffer())).toEqual(bytes);
      const playbackUrl = await storage.get('VIDEOS', key);
      const rangePreflight = await fetch(playbackUrl, {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'range',
        },
      });
      expect(rangePreflight.status).toBeLessThan(400);
      expect(rangePreflight.headers.get('access-control-allow-origin')).toBe(origin);
      const range = await fetch(playbackUrl, { headers: { Origin: origin, Range: 'bytes=0-3' } });
      expect(range.status).toBe(206);
      expect(range.headers.get('content-range')).toBe(`bytes 0-3/${bytes.length}`);
      expect(Buffer.from(await range.arrayBuffer())).toEqual(bytes.subarray(0, 4));
    } finally {
      for (const [bucket, key] of created) await storage.delete(bucket, key);
      storage.onModuleDestroy();
    }
  },
  30000,
);

live('keeps books private and serves signed inline and attachment PDFs', async () => {
  const storage = new StorageService();
  const directory = await mkdtemp(join(tmpdir(), 'books-live-'));
  const key = `books/${randomUUID()}/${randomUUID()}.pdf`;
  const bytes = Buffer.from('%PDF-1.4\nPrivate Japanese practice book\n%%EOF');
  try {
    const path = join(directory, 'practice.pdf');
    await writeFile(path, bytes);
    await storage.putFile('BOOKS', key, path, 'application/pdf');
    for (const disposition of ['inline; filename="practice.pdf"', 'attachment; filename="practice.pdf"']) {
      const url = await storage.get('BOOKS', key, { expiresIn: 300, contentType: 'application/pdf', contentDisposition: disposition });
      expect(new URL(url).searchParams.get('X-Amz-Expires')).toBe('300');
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/pdf');
      expect(response.headers.get('content-disposition')).toBe(disposition);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      const unsigned = new URL(url);
      unsigned.search = '';
      expect((await fetch(unsigned)).status).toBe(403);
    }
  } finally {
    await storage.delete('BOOKS', key);
    await rm(directory, { recursive: true, force: true });
    storage.onModuleDestroy();
  }
}, 30000);
