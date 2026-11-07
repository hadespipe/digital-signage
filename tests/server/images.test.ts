import { expect, test } from 'bun:test';
import sharp from 'sharp';
import { normalizeImage } from '../../server/images';

for (const format of ['jpeg', 'png', 'webp'] as const) {
  test(`normalizes actual ${format} to JPEG`, async () => {
    const input = await sharp({ create: { width: 5000, height: 3000, channels: 3, background: 'red' } }).toFormat(format).toBuffer();
    const image = await normalizeImage(input);
    const metadata = await sharp(image.bytes).metadata();
    expect(metadata.format).toBe('jpeg');
    expect(image.width).toBe(3600);
    expect(image.height).toBe(2160);
  });
}
test('rotates EXIF orientation', async () => {
  const input = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'red' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const image = await normalizeImage(input);
  expect([image.width, image.height]).toEqual([20, 40]);
});
test('rejects empty, corrupt, SVG, oversized, animated and excessive decoded pixels', async () => {
  const large = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: 'red' } }).png().toBuffer();
  const animated = await sharp(Buffer.from([...Array(12).fill(255), ...Array(12).fill(0)]), { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  for (const input of [new Uint8Array(), Buffer.from('corrupt'), Buffer.from('<svg width="1" height="1"><rect width="1" height="1"/></svg>'), new Uint8Array(10 * 1024 * 1024 + 1), large, animated]) {
    await expect(normalizeImage(input)).rejects.toThrow();
  }
});
