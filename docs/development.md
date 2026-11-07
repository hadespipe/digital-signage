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
