import { accessSync, constants, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Config {
  port: number;
  dataDir: string;
  adminPasswordHash: string;
  tvReadToken: string;
  publicOrigin: string;
  allowLanHttp: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH ?? '';
  // Accept the formats supported by Bun.password (Argon2 and bcrypt).
  const argonHash = /^\$argon2(?:id|i|d)\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;
  const bcryptHash = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
  if (!argonHash.test(adminPasswordHash) && !bcryptHash.test(adminPasswordHash)) throw new Error('ADMIN_PASSWORD_HASH must be a real Bun.password hash');
  const tvReadToken = env.TV_READ_TOKEN ?? '';
  if (!/^[A-Za-z0-9_-]{32,}$/.test(tvReadToken) || tvReadToken === adminPasswordHash) throw new Error('TV_READ_TOKEN must be a distinct random token of at least 32 URL-safe characters');
  if (env.ALLOW_LAN_HTTP !== undefined && !['true', 'false'].includes(env.ALLOW_LAN_HTTP)) throw new Error('ALLOW_LAN_HTTP must be true or false');
  const allowLanHttp = env.ALLOW_LAN_HTTP === 'true';
  let origin: URL;
  try {
    const raw = env.PUBLIC_ORIGIN ?? '';
    origin = new URL(raw);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || raw !== origin.origin && raw !== `${origin.origin}/`) throw new Error();
  } catch {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment');
  }
  if (origin.protocol !== 'https:' && !allowLanHttp) throw new Error('HTTPS is required; local LAN testing requires explicit ALLOW_LAN_HTTP=true');
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
  if (env.DATA_DIR !== undefined && !env.DATA_DIR.trim()) throw new Error('DATA_DIR must not be empty');
  const dataDir = resolve(env.DATA_DIR ?? './data');
  try {
    mkdirSync(dataDir, { recursive: true });
    if (!statSync(dataDir).isDirectory()) throw new Error();
    accessSync(dataDir, constants.R_OK | constants.W_OK | constants.X_OK);
  } catch {
    throw new Error('DATA_DIR must be a readable, writable directory that can be created');
  }
  return { port, dataDir, adminPasswordHash, tvReadToken, publicOrigin: origin.origin, allowLanHttp };
}
