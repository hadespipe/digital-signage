import type { Hono, MiddlewareHandler } from 'hono';
import type { Auth, AuthEnv } from './auth';
import { normalizeImage } from './images';
import { PlaylistError, type PlaylistStore } from './playlist';

const FILE_LIMIT = 10 * 1024 * 1024;
const BODY_LIMIT = 51 * 1024 * 1024;
class RequestError extends Error {
  constructor(readonly status: 400 | 413 | 422 | 429) { super('Request rejected'); }
}

// Read the stream with a hard bound before asking the multipart parser to allocate.
async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get('Content-Length');
  if (declared && Number(declared) > limit) throw new RequestError(413);
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export function imageRoutes(app: Hono<AuthEnv>, auth: Auth, store: PlaylistStore): void {
  app.onError((error, c) => {
    const status = error instanceof RequestError || error instanceof PlaylistError ? error.status : 500;
    return c.json({ error: { code: `HTTP_${status}`, message: status === 500 ? 'Internal server error' : 'Request rejected' } }, status);
  });
  const readCors: MiddlewareHandler<AuthEnv> = async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Cache-Control', 'no-store');
    await next();
  };
  for (const path of ['/api/playlist', '/api/images/:id']) {
    app.options(path, c => {
      if (c.req.header('Access-Control-Request-Method') !== 'GET') return c.body(null, 403);
      c.header('Access-Control-Allow-Origin', '*');
      c.header('Access-Control-Allow-Methods', 'GET');
      c.header('Access-Control-Allow-Headers', 'Authorization');
      return c.body(null, 204);
    });
  }
  app.get('/api/playlist', readCors, auth.read, async c => c.json(await store.read()));
  app.get('/api/images/:id', readCors, auth.read, async c => {
    const bytes = await store.imageBytes(c.req.param('id'));
    c.header('Content-Type', 'image/jpeg');
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(new Uint8Array(bytes).buffer);
  });
  // Admission covers buffering, parsing and normalization. No unbounded waiting queue.
  let activeUploads = 0;
  app.post('/api/images', auth.write, async c => {
    if (activeUploads >= 2) throw new RequestError(429);
    activeUploads++;
    try {
      const bytes = await boundedBody(c.req.raw, BODY_LIMIT);
      let form: FormData;
      try {
        form = await new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': c.req.header('Content-Type') ?? '' } }).formData();
      } catch { throw new RequestError(400); }
      const files: File[] = [];
      for (const [key, value] of form.entries()) {
        if (key !== 'images' || typeof value === 'string') throw new RequestError(422);
        const file = value as File;
        if (file.size > FILE_LIMIT) throw new RequestError(413);
        files.push(file);
      }
      if (!files.length || files.length > 5) throw new RequestError(422);
      const images = [];
      // Normalize sequentially within each admitted request, at most two decoders total.
      for (const file of files) {
        try { images.push(await normalizeImage(new Uint8Array(await file.arrayBuffer()))); }
        catch { throw new RequestError(422); }
      }
      c.header('Cache-Control', 'no-store');
      return c.json(await store.add(images), 201);
    } finally { activeUploads--; }
  });
  app.delete('/api/images/:id', auth.write, async c => {
    c.header('Cache-Control', 'no-store');
    return c.json(await store.remove(c.req.param('id')));
  });
  app.put('/api/playlist/order', auth.write, async c => {
    const bytes = await boundedBody(c.req.raw, 4096);
    let data: unknown;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new RequestError(400); }
    const ids = (data as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => typeof id !== 'string')) throw new RequestError(422);
    c.header('Cache-Control', 'no-store');
    return c.json(await store.reorder(ids));
  });
}
