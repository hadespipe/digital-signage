import { Hono } from 'hono';
import type { Config } from './config';
import { createAuth, type Auth, type AuthEnv } from './auth';
import type { HealthResponse } from '../shared/contracts';

export interface AppDeps {
  config: Config;
  auth?: Auth;
}

export function createApp(deps: AppDeps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const auth = deps.auth ?? createAuth(deps.config);
  app.get('/api/health', (c) => c.json({ ok: true } satisfies HealthResponse));
  app.post('/api/auth/login', auth.login);
  app.get('/api/auth/session', auth.getSession);
  app.post('/api/auth/logout', auth.write, auth.logout);
  return app;
}
