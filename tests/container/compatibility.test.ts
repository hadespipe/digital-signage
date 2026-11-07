import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

// Deliberately opt-in and failing, never skipped, when Docker is unavailable.
test('Linux Bun/sharp container authenticates, decodes and persists across recreation', async () => {
  const docker = Bun.which('docker');
  if (!docker) throw new Error('BLOCKED: Docker executable unavailable; install/start Docker externally and rerun test:container');
  const run = async (...args: string[]) => {
    const p = Bun.spawn([docker, ...args], { stdout: 'pipe', stderr: 'pipe' });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(`Docker ${args[0]} failed (${code}): ${err}`);
    return out.trim();
  };
  await run('info');
  const suffix = crypto.randomUUID();
  const name = `signage-test-${suffix}`, volume = `${name}-data`, image = 'signage-compatibility:test';
  const dir = await mkdtemp(join(tmpdir(), 'signage-container-'));
  const password = crypto.randomUUID(), token = crypto.randomUUID().replaceAll('-', '') + 'test';
  const env = join(dir, 'runtime.env');
  await writeFile(env, `ADMIN_PASSWORD_HASH=${await Bun.password.hash(password)}\nTV_READ_TOKEN=${token}\nPUBLIC_ORIGIN=http://localhost:3000\nALLOW_LAN_HTTP=true\nDATA_DIR=/data\n`, { mode: 0o600 });
  let base = '';
  const start = async () => {
    await run('run', '-d', '--name', name, '--memory=2g', '--cpus=2', '--env-file', env, '-p', '127.0.0.1::3000', '-v', `${volume}:/data`, image);
    const port = (await run('port', name, '3000/tcp')).split(':').pop();
    base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await Bun.sleep(100);
    }
    throw new Error('Container health did not become ready');
  };
  try {
    await run('build', '-t', image, '.');
    await run('volume', 'create', volume);
    await start();
    expect((await fetch(base)).status).toBe(200);
    expect((await fetch(`${base}/api/playlist`)).status).toBe(401);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { Origin: 'http://localhost:3000', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const csrf = (await login.json() as { csrfToken: string }).csrfToken;
    const headers = { Cookie: cookie, Origin: 'http://localhost:3000', 'X-CSRF-Token': csrf };
    expect((await fetch(`${base}/api/images`, { method: 'POST', headers: { Cookie: cookie, Origin: headers.Origin } })).status).toBe(403);
    const form = new FormData();
    form.append('images', new Blob([await sharp({ create: { width: 4, height: 3, channels: 3, background: 'red' } }).png().toBuffer()]), 'test.png');
    const upload = await fetch(`${base}/api/images`, { method: 'POST', headers, body: form });
    expect(upload.status).toBe(201);
    const playlist = await upload.json() as { images: { path: string }[] };
    const tvHeaders = { Authorization: `Bearer ${token}` };
    const read = await fetch(`${base}${playlist.images[0]!.path}`, { headers: tvHeaders });
    expect(read.status).toBe(200);
    expect((await sharp(Buffer.from(await read.arrayBuffer())).metadata()).format).toBe('jpeg');
    await run('stop', name); await run('rm', name); await start();
    expect(await (await fetch(`${base}/api/playlist`, { headers: tvHeaders })).json()).toEqual(playlist);
    expect((await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } })).status).toBe(401);
  } finally {
    await run('rm', '-f', name).catch(() => {});
    await run('volume', 'rm', volume).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}, 240_000);
