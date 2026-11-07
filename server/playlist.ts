import { open, mkdir, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Playlist } from '../shared/contracts';
import type { NormalizedImage } from './images';
export type { Playlist } from '../shared/contracts';

export class PlaylistError extends Error {
  constructor(public readonly status: 404 | 409 | 422, message: string) { super(message); }
}
export interface PlaylistStore {
  read(): Promise<Playlist>;
  add(images: NormalizedImage[]): Promise<Playlist>;
  remove(id: string): Promise<Playlist>;
  reorder(ids: string[]): Promise<Playlist>;
  imageBytes(id: string): Promise<Uint8Array>;
}
interface OpenOptions { beforeMetadataRename?: () => Promise<void> }
// All handles for one directory share a queue, including reopening in this process.
const queues = new Map<string, Promise<unknown>>();
function serialize<T>(dir: string, action: () => Promise<T>): Promise<T> {
  const result = (queues.get(dir) ?? Promise.resolve()).then(action, action);
  queues.set(dir, result.catch(() => undefined));
  return result;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validate(value: unknown): Playlist {
  const data = value as Playlist;
  if (!data || !Number.isSafeInteger(data.version) || data.version < 0 || !Array.isArray(data.images) || data.images.length > 5 ||
      data.images.some(item => !item || typeof item.id !== 'string' || !uuid.test(item.id) || item.path !== `/api/images/${item.id}`) ||
      new Set(data.images.map(item => item.id)).size !== data.images.length) throw new Error('Corrupt playlist metadata');
  return data;
}
async function durableWrite(path: string, bytes: Uint8Array | string): Promise<void> {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
async function syncDirectory(dir: string): Promise<void> {
  const file = await open(dir, 'r');
  try { await file.sync(); } finally { await file.close(); }
}
export async function openPlaylist(dataDir: string, options: OpenOptions = {}): Promise<PlaylistStore> {
  const dir = resolve(dataDir);
  const metadataPath = join(dir, 'playlist.json');
  const imagePath = (id: string) => join(dir, `${id}.jpg`);
  async function read(): Promise<Playlist> {
    try { return validate(JSON.parse(await readFile(metadataPath, 'utf8'))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 0, images: [] }; throw error; }
  }
  await serialize(dir, async () => {
    await mkdir(dir, { recursive: true });
    const current = await read();
    for (const item of current.images) {
      const bytes = await readFile(imagePath(item.id));
      const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' });
      const metadata = await decoder.metadata();
      if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || metadata.width > 3840 || metadata.height > 2160) throw new Error('Corrupt referenced image');
      await decoder.stats();
    }
    const referenced = new Set(current.images.map(item => `${item.id}.jpg`));
    for (const name of await readdir(dir)) {
      if ((name.endsWith('.jpg') && !referenced.has(name)) || name.startsWith('.playlist-')) await unlink(join(dir, name));
    }
  });
  async function mutate(update: (current: Playlist, staged: string[]) => Promise<Playlist>): Promise<Playlist> {
    return serialize(dir, async () => {
      const current = await read();
      const staged: string[] = [];
      const temporary = join(dir, `.playlist-${randomUUID()}.tmp`);
      let published = false;
      try {
        if (current.version === Number.MAX_SAFE_INTEGER) throw new Error('Playlist version exhausted');
        const next = await update(current, staged);
        next.version = current.version + 1;
        await durableWrite(temporary, JSON.stringify(next));
        // Persist new image directory entries before publishing their metadata references.
        await syncDirectory(dir);
        await options.beforeMetadataRename?.();
        await rename(temporary, metadataPath);
        published = true;
        await syncDirectory(dir);
        for (const item of current.images) {
          if (!next.images.some(candidate => candidate.id === item.id)) await unlink(imagePath(item.id)).catch(() => undefined);
        }
        return next;
      } finally {
        await unlink(temporary).catch(() => undefined);
        if (!published) await Promise.all(staged.map(path => unlink(path).catch(() => undefined)));
      }
    });
  }
  return {
    read: () => serialize(dir, read),
    add: images => mutate(async (current, staged) => {
      if (!images.length) throw new PlaylistError(422, 'An image batch must not be empty');
      if (current.images.length + images.length > 5) throw new PlaylistError(409, 'A maximum of five images is allowed');
      if (images.some(image => !image.bytes.byteLength || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1)) throw new PlaylistError(422, 'Invalid normalized image');
      const next = [...current.images];
      for (const image of images) {
        const id = randomUUID();
        const path = imagePath(id);
        staged.push(path);
        await durableWrite(path, image.bytes);
        next.push({ id, path: `/api/images/${id}` });
      }
      return { version: current.version, images: next };
    }),
    remove: id => mutate(async current => {
      if (!current.images.some(item => item.id === id)) throw new PlaylistError(404, 'Image not found');
      return { version: current.version, images: current.images.filter(item => item.id !== id) };
    }),
    reorder: ids => mutate(async current => {
      if (ids.length !== current.images.length || new Set(ids).size !== ids.length || ids.some(id => !current.images.some(item => item.id === id))) throw new PlaylistError(422, 'Order must be an exact permutation of the playlist');
      return { version: current.version, images: ids.map(id => current.images.find(item => item.id === id)!) };
    }),
    imageBytes: id => serialize(dir, async () => {
      const current = await read();
      if (!current.images.some(item => item.id === id)) throw new PlaylistError(404, 'Image not found');
      return new Uint8Array(await readFile(imagePath(id)));
    }),
  };
}
