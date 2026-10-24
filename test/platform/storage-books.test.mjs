import 'reflect-metadata';
import { it, expect } from '@jest/globals';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageService } from '../../dist/platform/storage.service.js';

it('streams a disk PDF to private books storage and signs inline or attachment access', async () => {
  const received = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({
      method: req.method,
      path: req.url,
      headers: req.headers,
      body: Buffer.concat(chunks),
    });
    res.writeHead(200, { ETag: '"test"' }).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const vars = {
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_URL: endpoint,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test',
    S3_FORCE_PATH_STYLE: 'true',
    S3_BUCKET_BOOKS: 'private-books',
  };
  const before = Object.fromEntries(
    Object.keys(vars).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, vars);
  const storage = new StorageService();
  const dir = await mkdtemp(join(tmpdir(), 'book-storage-'));
  try {
    const bytes = Buffer.from('%PDF-1.7\nTest PDF upload\n%%EOF');
    const path = join(dir, 'book.pdf');
    await writeFile(path, bytes);
    expect(
      await storage.putFile(
        'BOOKS',
        'books/course/book.pdf',
        path,
        'application/pdf',
      ),
    ).toBe('books/course/book.pdf');
    expect(received).toHaveLength(1);
    expect(received[0].method).toBe('PUT');
    expect(received[0].path).toContain('/private-books/books/course/book.pdf');
    expect(received[0].headers['content-length']).toBe(String(bytes.length));
    expect(received[0].headers['content-type']).toBe('application/pdf');
    expect(received[0].body).toEqual(bytes);
    for (const disposition of ['inline', 'attachment; filename="book.pdf"']) {
      const url = new URL(
        await storage.get('BOOKS', 'books/course/book.pdf', {
          expiresIn: 300,
          contentDisposition: disposition,
          contentType: 'application/pdf',
        }),
      );
      expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(url.searchParams.get('response-content-disposition')).toBe(
        disposition,
      );
      expect(url.searchParams.get('response-content-type')).toBe(
        'application/pdf',
      );
    }
    const preview = new URL(
      await storage.get('BOOKS', 'books/course/book.pdf'),
    );
    expect(preview.searchParams.get('X-Amz-Expires')).toBe('3600');
    await expect(
      storage.putFile(
        'BOOKS',
        'missing.pdf',
        join(dir, 'missing.pdf'),
        'application/pdf',
      ),
    ).rejects.toMatchObject({ response: { code: 'STORAGE_UNAVAILABLE' } });
  } finally {
    storage.onModuleDestroy();
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
