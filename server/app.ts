import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { imageRoutes } from "./routes";
import type { PlaylistStore } from "./playlist";
import type { Config } from "./config";
import { createAuth, type Auth, type AuthEnv } from "./auth";
import type { HealthResponse } from "../shared/contracts";

export interface AppDeps {
  config: Config;
  auth?: Auth;
  store?: PlaylistStore;
}

export function createApp(deps: AppDeps): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const auth = deps.auth ?? createAuth(deps.config);
  app.get("/api/health", (c) => c.json({ ok: true } satisfies HealthResponse));
  app.post("/api/auth/login", auth.login);
  app.get("/api/auth/session", auth.getSession);
  app.post("/api/auth/logout", auth.write, auth.logout);
  if (deps.store) imageRoutes(app, auth, deps.store);
  // Unknown API paths must never fall through to HTML.
  app.all("/api/*", (c) =>
    c.json(
      { error: { code: "NOT_FOUND", message: "API route not found" } },
      404,
    ),
  );
  app.get("/*", serveStatic({ root: "./dist/admin" }));
  return app;
}
