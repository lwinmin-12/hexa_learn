import {fail} from './common.js';
export function imageFile(file: Express.Multer.File | undefined) {
  if (!file || file.size > 5 * 1024 * 1024)
    fail(400, 'INVALID_FILE', 'An image up to 5 MB is required');
  const b = file.buffer;
  const ext =
    b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255
      ? 'jpg'
      : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : b.toString('ascii', 0, 4) === 'RIFF' &&
            b.toString('ascii', 8, 12) === 'WEBP'
          ? 'webp'
          : null;
  if (
    !ext ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
  )
    fail(400, 'INVALID_FILE', 'Only JPG, PNG and WebP images are allowed');
  return {
    ext,
    contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`,
    buffer: b,
  };
}
