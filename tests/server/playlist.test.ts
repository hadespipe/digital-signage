import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { openPlaylist } from '../../server/playlist';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
async function setup() { const dir = await mkdtemp(join(tmpdir(), 'playlist-')); dirs.push(dir); return { dir, store: await openPlaylist(dir) }; }
const image = { bytes: new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } }).jpeg().toBuffer()), width: 1, height: 1 };
test('persists order, versions, opaque public paths and deletion', async () => {
  const { dir, store } = await setup();
  const added = await store.add([image, image]);
  expect(added.version).toBe(1);
  expect(added.images[0]!.path).toBe(`/api/images/${added.images[0]!.id}`);
  const ids = added.images.map(item => item.id).reverse();
  await store.reorder(ids);
  expect((await (await openPlaylist(dir)).read()).images.map(item => item.id)).toEqual(ids);
  expect(await store.imageBytes(ids[0]!)).toEqual(image.bytes);
  await store.remove(ids[0]!);
  expect((await store.read()).version).toBe(3);
  await expect(store.imageBytes(ids[0]!)).rejects.toMatchObject({ status: 404 });
});
test('serializes capacity checks and rejects invalid batches/permutations without changes', async () => {
  const { store } = await setup();
  const before = await store.add([image, image, image, image]);
  await expect(store.add([image, image])).rejects.toMatchObject({ status: 409 });
  for (const ids of [[], before.images.map(() => before.images[0]!.id), ['unknown']]) await expect(store.reorder(ids)).rejects.toMatchObject({ status: 422 });
  await expect(store.remove('unknown')).rejects.toMatchObject({ status: 404 });
  await expect(store.add([{ ...image, bytes: new Uint8Array() }])).rejects.toMatchObject({ status: 422 });
  expect(await store.read()).toEqual(before);
  const results = await Promise.allSettled([store.add([image]), store.add([image])]);
  expect(results.filter(item => item.status === 'fulfilled')).toHaveLength(1);
  expect((await store.read()).images).toHaveLength(5);
});
test('metadata failure preserves prior durable state and cleans staged data', async () => {
  const { dir, store } = await setup();
  const before = await store.add([image]);
  const failing = await openPlaylist(dir, { beforeMetadataRename: async () => { throw new Error('injected write failure'); } });
  await expect(failing.add([image])).rejects.toThrow('injected');
  expect(await failing.read()).toEqual(before);
  expect(await (await openPlaylist(dir)).read()).toEqual(before);
  expect((await readdir(dir)).filter(name => name.endsWith('.jpg'))).toHaveLength(1);
});
test('startup cleans orphans and rejects corrupt metadata/missing files', async () => {
  const { dir, store } = await setup();
  await writeFile(join(dir, 'orphan.jpg'), 'orphan');
  await openPlaylist(dir);
  expect(await readdir(dir)).not.toContain('orphan.jpg');
  await store.add([image]);
  const metadata = JSON.parse(await readFile(join(dir, 'playlist.json'), 'utf8'));
  await writeFile(join(dir, `${metadata.images[0].id}.jpg`), 'corrupt');
  await expect(openPlaylist(dir)).rejects.toThrow();
  await rm(join(dir, `${metadata.images[0].id}.jpg`));
  await expect(openPlaylist(dir)).rejects.toThrow();
  await writeFile(join(dir, 'playlist.json'), '{broken');
  await expect(openPlaylist(dir)).rejects.toThrow();
});
