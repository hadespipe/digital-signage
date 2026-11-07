import { expect, test } from 'bun:test';
import { createApp } from '../../server/app';

test('health_has_no_secrets', async () => {
  const app = createApp({ config: { port: 3000, dataDir: '/unused', adminPasswordHash: 'secret-hash', tvReadToken: 'secret-token', publicOrigin: 'https://example.com', allowLanHttp: false } });
  const response = await app.request('/api/health');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
