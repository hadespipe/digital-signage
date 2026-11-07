# Development

Use Bun 1.4.4 (the tested version), then run `bun install --frozen-lockfile`.
The lockfile pins Hono 4.13.17, TypeScript 7.0.2 and @types/bun 1.4.4.

Copy `.env.example` to `.env` and replace every credential/origin placeholder.
Generate a password hash interactively without putting the password in shell history:

```sh
bun -e 'const password = prompt("Admin password (input visible):"); if (!password) throw new Error("Password required"); console.log(await Bun.password.hash(password));'
bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Paste the hash into `ADMIN_PASSWORD_HASH` and random token into `TV_READ_TOKEN` in
`.env`. These outputs are secrets; do not save them in source control or logs.
The TV token must be separate from the administrator credential. It accepts at
least 32 URL-safe characters; use the generator rather than a memorable value.

Set `PUBLIC_ORIGIN` to the externally visible HTTPS origin, such as
`https://signage.example.com` (no path, credentials, query or fragment).
For a local LAN test, use the computer's LAN IP and port, for example
`http://192.168.1.10:3000`, and explicitly set `ALLOW_LAN_HTTP=true`.
HTTPS is required by default in every environment, including production.
Bun automatically loads `.env`; missing or placeholder credentials fail startup.

`DATA_DIR` defaults to `./data`, resolved against the working directory. Startup
creates the directory and verifies directory access. Keep this directory on
persistent storage. `PORT` defaults to 3000 and must be 1–65535.

```sh
bun run dev
bun run start
bun run test:server
bun run typecheck
```

Only `server/index.ts` opens a listener, on `0.0.0.0`, so LAN devices can reach
it. `createApp({ config })` returns an isolated Hono app for in-process tests;
its dependency interface will receive typed auth/store services in later tasks.
`GET /api/health` returns exactly `{"ok":true}` and no configuration.

Admin build, player, end-to-end, TV compatibility and TV packaging scripts will
be added with the tasks that implement them. This foundation does not yet
include those applications, authentication, image handling, Docker verification,
or an installable webOS package. No real-TV test has been performed.

## Image administration

Run `bun run build:admin` and `bun start`, then open the configured `PUBLIC_ORIGIN`.
The Bun server serves the built admin and API from the same origin. The client
uses only the HttpOnly session cookie and an in-memory CSRF token; server environment
variables and TV credentials are never bundled.

For Vite development, run Bun on port 3000 and `bun run dev:admin` in another terminal.
Set `PUBLIC_ORIGIN=http://127.0.0.1:5173` and `ALLOW_LAN_HTTP=true` for that local
session, then open exactly `http://127.0.0.1:5173`. Vite proxies `/api` to Bun;
it preserves the browser Origin header so authentication checks match. For the
built app on port 3000, change `PUBLIC_ORIGIN` back to `http://127.0.0.1:3000`.
Production requires HTTPS. Never use a `VITE_` variable for credentials.

Browser checks: `bunx playwright install chromium`, `bun run build:admin`, then
`bun run test:e2e`. The harness starts a separate listener on 127.0.0.1:3187 with
fresh temporary data and test credentials; do not run it against production.
