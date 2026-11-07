import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../server/config';

const roots: string[] = [];
function env() {
  const root = mkdtempSync(join(tmpdir(), 'signage-config-'));
  roots.push(root);
  return { ADMIN_PASSWORD_HASH: Bun.password.hashSync('test-password'), TV_READ_TOKEN: 'a'.repeat(64), PUBLIC_ORIGIN: 'https://signage.example.com', DATA_DIR: join(root, 'data') };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test('config_requires_credentials', () => {
  const valid = env();
  for (const key of ['ADMIN_PASSWORD_HASH', 'TV_READ_TOKEN']) expect(() => loadConfig({ ...valid, [key]: '' })).toThrow(key);
  expect(() => loadConfig({ ...valid, ADMIN_PASSWORD_HASH: 'replace-me' })).toThrow('ADMIN_PASSWORD_HASH');
  expect(() => loadConfig({ ...valid, TV_READ_TOKEN: 'replace-me' })).toThrow('TV_READ_TOKEN');
});
test('production_requires_https', () => {
  const valid = { ...env(), NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://192.168.1.10:3000' };
  expect(() => loadConfig(valid)).toThrow('HTTPS');
  expect(loadConfig({ ...valid, ALLOW_LAN_HTTP: 'true' }).allowLanHttp).toBe(true);
  expect(() => loadConfig({ ...valid, ALLOW_LAN_HTTP: 'false' })).toThrow('HTTPS');
});
test('rejects malformed and non-origin URLs', () => {
  const valid = env();
  for (const origin of ['', 'nonsense', 'ftp://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?x=1', 'https://example.com/#x']) expect(() => loadConfig({ ...valid, PUBLIC_ORIGIN: origin })).toThrow('PUBLIC_ORIGIN');
});
test('rejects directories that cannot be created', () => {
  const valid = env();
  writeFileSync(valid.DATA_DIR, 'file blocks directory');
  expect(() => loadConfig(valid)).toThrow('DATA_DIR');
});
test('valid configuration creates directory and uses default port', () => {
  const valid = env();
  const config = loadConfig(valid);
  expect(config).toEqual({ port: 3000, dataDir: valid.DATA_DIR, adminPasswordHash: valid.ADMIN_PASSWORD_HASH, tvReadToken: valid.TV_READ_TOKEN, publicOrigin: valid.PUBLIC_ORIGIN, allowLanHttp: false });
});
test('rejects invalid ports and nonexplicit LAN exceptions', () => {
  const valid = env();
  for (const port of ['0', '65536', 'abc', '3000.5', '']) expect(() => loadConfig({ ...valid, PORT: port })).toThrow('PORT');
  expect(loadConfig({ ...valid, PORT: '8080' }).port).toBe(8080);
  expect(() => loadConfig({ ...valid, ALLOW_LAN_HTTP: 'yes' })).toThrow('ALLOW_LAN_HTTP');
});
