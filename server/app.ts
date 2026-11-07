import { Hono } from 'hono';
import type { Config } from './config';
import type { HealthResponse } from '../shared/contracts';

// Add typed injectable auth/store services here as those modules are implemented.
export interface AppDeps {
  config: Config;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  app.get('/api/health', (c) => c.json({ ok: true } satisfies HealthResponse));
  return app;
}
