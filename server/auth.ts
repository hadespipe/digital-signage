import { timingSafeEqual } from 'node:crypto';
import type { Context, Handler, MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Config } from './config';

export type AuthEnv = { Bindings: { clientAddress?: string } };
const SESSION_MS = 12 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 1024;
const MAX_CLIENTS = 4096;
const COOKIE = 'signage_session';
function equal(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function randomToken(): string { return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'); }
export function createAuth(config: Config, options: {
  now?: () => number;
  verifyPassword?: (password: string, hash: string) => Promise<boolean>;
} = {}) {
  const now = options.now ?? Date.now;
  const verify = options.verifyPassword ?? ((password, hash) => Bun.password.verify(password, hash));
  const sessions = new Map<string, { csrfToken: string; expires: number }>();
  const attempts = new Map<string, { failures: number; expires: number }>();
  const error = (c: Context, status: 400 | 401 | 403 | 429, code: string) => c.json({ error: { code, message: code === 'RATE_LIMITED' ? 'Try again later' : 'Authentication request rejected' } }, status);
  function prune() {
    const time = now();
    for (const [id, session] of sessions) if (session.expires <= time) sessions.delete(id);
    for (const [id, attempt] of attempts) if (attempt.expires <= time) attempts.delete(id);
  }
  function session(c: Context) { prune(); const id = getCookie(c, COOKIE); return id ? sessions.get(id) : undefined; }
  const originOK = (c: Context) => c.req.header('Origin') === config.publicOrigin;
  const sessionMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => { if (!session(c)) return error(c, 401, 'UNAUTHORIZED'); await next(); };
  const read: MiddlewareHandler<AuthEnv> = async (c, next) => {
    if (!session(c) && (!['GET', 'HEAD'].includes(c.req.method) || !equal(c.req.header('Authorization') ?? '', `Bearer ${config.tvReadToken}`))) return error(c, 401, 'UNAUTHORIZED');
    await next();
  };
  const write: MiddlewareHandler<AuthEnv> = async (c, next) => {
    const current = session(c);
    if (!current) return error(c, 401, 'UNAUTHORIZED');
    if (!originOK(c) || !equal(c.req.header('X-CSRF-Token') ?? '', current.csrfToken)) return error(c, 403, 'FORBIDDEN');
    await next();
  };
  const cookieOptions = { httpOnly: true, sameSite: 'Strict' as const, secure: new URL(config.publicOrigin).protocol === 'https:', path: '/' };
  const login: Handler<AuthEnv> = async c => {
    if (!originOK(c)) return error(c, 403, 'FORBIDDEN');
    prune();
    // Set only by the direct Bun listener. No forwarded headers are trusted.
    const client = c.env?.clientAddress ?? 'unknown';
    let attempt = attempts.get(client);
    if (attempt && attempt.failures >= 5) return error(c, 429, 'RATE_LIMITED');
    if (!attempt) {
      // Fail closed at capacity; eviction would let a client bypass throttling.
      if (attempts.size >= MAX_CLIENTS) return error(c, 429, 'RATE_LIMITED');
      attempt = { failures: 0, expires: now() + WINDOW_MS }; attempts.set(client, attempt);
    }
    // Reserve before awaiting verification to bound concurrent guessing too.
    attempt.failures++;
    let password: unknown;
    try { password = (await c.req.json()).password; } catch { return error(c, 400, 'INVALID_REQUEST'); }
    if (typeof password !== 'string' || password.length > 1024) return error(c, 400, 'INVALID_REQUEST');
    let valid = false;
    try { valid = await verify(password, config.adminPasswordHash); } catch { /* Invalid hashes fail safely without exposing verifier details. */ }
    if (!valid) return error(c, 401, 'UNAUTHORIZED');
    attempts.delete(client);
    prune();
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
    const id = randomToken(), csrfToken = randomToken();
    sessions.set(id, { csrfToken, expires: now() + SESSION_MS });
    setCookie(c, COOKIE, id, { ...cookieOptions, maxAge: SESSION_MS / 1000 });
    c.header('Cache-Control', 'no-store');
    return c.json({ csrfToken });
  };
  const getSession: Handler<AuthEnv> = c => {
    const current = session(c);
    c.header('Cache-Control', 'no-store');
    return current ? c.json({ csrfToken: current.csrfToken }) : error(c, 401, 'UNAUTHORIZED');
  };
  const logout: Handler<AuthEnv> = c => {
    const id = getCookie(c, COOKIE); if (id) sessions.delete(id);
    setCookie(c, COOKIE, '', { ...cookieOptions, maxAge: 0 });
    return c.body(null, 204);
  };
  return { login, getSession, logout, session: sessionMiddleware, read, write };
}
export type Auth = ReturnType<typeof createAuth>;
