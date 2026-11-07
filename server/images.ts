import sharp from 'sharp';

export interface NormalizedImage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function normalizeImage(input: Uint8Array): Promise<NormalizedImage> {
  if (input.byteLength === 0 || input.byteLength > 10 * 1024 * 1024) {
    throw new Error('Image must contain between 1 byte and 10 MiB');
  }
  const decoder = sharp(input, { limitInputPixels: 40_000_000, animated: true, failOn: 'warning' });
  const metadata = await decoder.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1) {
    throw new Error('Only JPEG, PNG and static WebP images are supported');
  }
  const { data, info } = await decoder.rotate().resize({ width: 3840, height: 2160, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#000000' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}
