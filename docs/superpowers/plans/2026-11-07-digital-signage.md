# Digital Signage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. The user indicated subagent-driven execution on 2026-11-07; this update publishes the plan only, and implementation has not started.

**Goal:** Deliver a password-protected React image manager and an installable LG webOS slideshow app for the user's OLED48C1PTB.

**Architecture:** One Bun/Hono process serves the built React admin, authenticated image APIs, and persistent images. A separate plain-JavaScript webOS player downloads complete image sets before switching them, independently running its slideshow and synchronization timers. A filesystem repository serializes mutations and atomically publishes playlist metadata; deploy exactly one server instance per data directory.

**Tech Stack:** React, TypeScript, Vite; Bun, Hono, Sharp; Bun test runner; Playwright browser integration tests; Docker with a persistent volume; LG webOS packaging tools. Select compatible stable dependency versions during Task 1 and commit the lockfile; pin the tested Bun version and Docker base image during Task 8.

**Spec:** `docs/superpowers/specs/2026-11-07-digital-signage-design.md` (all specifications approved 2026-11-07).

## Global Constraints

- LG OLED48C1PTB; webOS 6.0 (Chromium 79); install `.ipk` through Developer Mode.
- React + TypeScript + Vite admin built as static files; TypeScript server on Bun + Hono; TV uses separate plain HTML/CSS/JavaScript.
- Maximum 5 active images; JPEG, PNG, static WebP input; 10 MB per file (implementation convention: 10 × 1024 × 1024 bytes).
- Normalize to JPEG, correct EXIF orientation, preserve aspect ratio, fit within 3840×2160.
- Black background, whole image visible, no transition effects; change every 2 seconds; one image stays visible.
- Poll every 5 seconds; only replace the visible set after every new image downloads successfully.
- Confirmed empty list displays exactly `Please upload`; network errors preserve the current in-memory set.
- One admin, one TV, one shared playlist. No video, scheduling, auto-launch, offline restart guarantee, or Developer Mode auto-renewal.
- Server-side sessions; HttpOnly/SameSite cookies, Secure over HTTPS; prevent CSRF and throttle login attempts.
- Read-only TV token in request headers only, never URLs/logs; distinct from admin credentials; production HTTPS required.
- Persistent metadata and files; atomic writes and serialized mutations; no credentials or uploaded files committed.
- Bun/Docker dependency compatibility and real-TV behavior must be verified separately; no assumed runtime performance benefit.

## Review Focus

These spec-implied failure cases receive explicit tests in the tasks below:

1. Task 3: simultaneous uploads and failed multi-file batches never exceed 5 images or publish a partial batch.
2. Tasks 3–4: corrupt/animated images, forged MIME types, path traversal, and oversized requests fail without exposing files or consuming unbounded resources.
3. Task 2: cross-site writes, expired sessions, spoofed proxy headers, and wrong/rotated TV tokens never grant write access.
4. Task 6: slow/stale downloads, deletes during download, invalid manifests, and outages never erase a previously working slideshow.
5. Task 7: remote-only setup, invalid URLs, storage failures, Back behavior, and changed credentials leave a recoverable TV UI.

## File Structure and Contracts

Paths below are implementation targets, not files already present. Keep related code together; avoid a general framework or monorepo workspace for this small app.

| Path | Responsibility |
| --- | --- |
| `package.json`, `bun.lock`, `tsconfig.json`, `.env.example` | Scripts, pinned dependencies, types, documented configuration |
| `server/index.ts`, `server/config.ts`, `server/app.ts` | Bun listener, validated configuration, injectable Hono application |
| `server/auth.ts` | Sessions, login throttling, read-token checks and CSRF |
| `server/playlist.ts`, `server/images.ts`, `server/routes.ts` | Durable playlist transactions, image normalization, HTTP API |
| `shared/contracts.ts` | Browser/server TypeScript HTTP response types |
| `admin/index.html`, `admin/src/{main.tsx,App.tsx,api.ts,styles.css}` | React shell and API client |
| `admin/src/{Login.tsx,PlaylistEditor.tsx,Preview.tsx}` | Login, uploads/order/delete, authenticated slideshow preview |
| `admin/vite.config.ts` | Admin build to `dist/admin`, development API proxy |
| `tv/{appinfo.json,index.html,styles.css,icon.png,largeIcon.png}` | webOS package metadata, layout and icons |
| `tv/{player.js,transport.js,settings.js,main.js}` | ES-compatible playback, HTTP/blob transport, remote settings, lifecycle |
| `tests/{server,player,e2e}/`, `tests/fixtures/` | API/persistence tests, deterministic player tests, browser journeys, image fixtures |
| `playwright.config.ts`, `scripts/{check-tv.mjs,package-tv.ts}` | Browser harness, Chromium 79 syntax checks, webOS packaging |
| `Dockerfile`, `.dockerignore`, `compose.yaml` | Reproducible single-instance deployment with persistent `/data` |
| `docs/{development.md,deployment.md,tv-installation.md,verification.md}` | Setup, deployment, TV steps, observed test results |

Shared interfaces (implement at the task named):

- Task 1: `createApp(deps: AppDeps): Hono`; `Config = { port, dataDir, adminPasswordHash, tvReadToken, publicOrigin, allowLanHttp }`; `GET /api/health -> { ok: true }` reveals no configuration.
- Task 3: `Playlist = { version: number, images: Array<{ id: string, path: string }> }`; `path` is `/api/images/<id>`, never an arbitrary external URL. Disk metadata additionally stores generated filename and creation time; do not expose disk paths.
- Task 3: `openPlaylist(dataDir: string): Promise<PlaylistStore>`; `store.read(): Promise<Playlist>`; `store.add(images: NormalizedImage[]): Promise<Playlist>`; `store.remove(id: string): Promise<Playlist>`; `store.reorder(ids: string[]): Promise<Playlist>`; `normalizeImage(input: Uint8Array): Promise<NormalizedImage>` where `NormalizedImage = { bytes: Uint8Array, width: number, height: number }`.
- Task 4: `GET /api/playlist`, `GET /api/images/:id` accept either valid admin session or `Authorization: Bearer <TV_READ_TOKEN>`. Only sessions authorize mutation routes. All errors use `{ error: { code: string, message: string } }` and no stack traces.
- Task 6: `createPlayer({ transport, clock, view }): { start(): void, stop(): void }`; `transport.getPlaylist(): Promise<Playlist>`; `transport.loadImage(path: string): Promise<{ url: string, release(): void }>`; `view.showImage(url)`, `view.showEmpty()`, `view.showConnectionError()`; injected clock supplies interval scheduling for deterministic tests. TV exposes one `Signage` namespace; no module-script requirement.

## Task 1: Runnable Bun/Hono app and configuration

**Files:** Create root package/type/env files, `server/{index,config,app}.ts`, `shared/contracts.ts`, `tests/server/config.test.ts`, `tests/server/health.test.ts`, `docs/development.md`. Extend `.gitignore` for `dist/`, test reports and package output.

**Interfaces:** Produces `Config`, `AppDeps` and `createApp` above. `AppDeps` takes validated config and injectable services; later tasks extend it. Only `index.ts` opens the network listener.

- [x] Set up Bun scripts `dev`, `start`, `build:admin`, `typecheck`, `test:server`, `test:player`, `test:e2e`, `check:tv`, `package:tv`; add scripts alongside the task that makes each runnable. Record the installed Bun version and compatible dependency versions in the lockfile.
- [x] Write failing tests: `health_has_no_secrets` asserts 200 and exact `{ok:true}`; `config_requires_credentials` rejects absent credentials; `production_requires_https` rejects HTTP unless explicit `ALLOW_LAN_HTTP=true`; reject malformed origins and directories that cannot be created.
- [x] Run `bun test tests/server/config.test.ts tests/server/health.test.ts`; expect assertion/import failures for unimplemented code.
- [x] Implement validated configuration with `ADMIN_PASSWORD_HASH`, `TV_READ_TOKEN`, `PUBLIC_ORIGIN`, `DATA_DIR`, `PORT`; document generating a password hash with Bun without committing it. Bind the LAN-test listener to `0.0.0.0`; default port 3000. Provide a placeholder-only `.env.example` and fail closed on missing real values.
- [x] Run the tests and `bun run typecheck`; expect green tests and no type errors. Commit: `chore: initialize Bun Hono application`.

## Task 2: Admin sessions and separate TV authorization

**Files:** Create `server/auth.ts`, `tests/server/auth.test.ts`; extend `server/app.ts`, `shared/contracts.ts`.

**Interfaces:** Produces `createAuth(config, {now, verifyPassword})` with session/read middleware. Routes: `POST /api/auth/login {password}` returns `{csrfToken}` and cookie; `GET /api/auth/session` returns `{csrfToken}` or 401; `POST /api/auth/logout` returns 204 and invalidates the session. Inject time and password verification for tests.

- [x] Write failing tests: valid login creates a random session and CSRF token; bad password returns 401; five failed logins per client in 15 minutes cause 429 on subsequent attempts; sessions expire after 12 hours and logout revokes them. These durations are implementation choices.
- [x] Add assertions: cookie is HttpOnly/SameSite=Strict and Secure on HTTPS; writes require exact configured Origin plus `X-CSRF-Token` including login Origin validation; wrong TV token is 401; valid TV token cannot mutate; spoofed forwarded headers cannot bypass policy. Verify a changed configured TV token rejects its predecessor.
- [x] Run `bun test tests/server/auth.test.ts` and confirm failures before implementing.
- [x] Implement Bun password verification, cryptographically random server-side session identifiers, bounded expiring in-memory session/throttle maps, and constant-time token comparison. Sessions intentionally expire on server restart. Trust no forwarded client IP by default; make optional trusted-proxy configuration explicit. Never log password, cookies or Authorization headers.
- [x] Run auth tests and typecheck; expect all pass. Commit: `feat: add admin sessions and TV read authorization`.

## Task 3: Image normalization and durable playlist transactions

**Files:** Create `server/{images,playlist}.ts`, `tests/server/{images,playlist}.test.ts`, image fixtures; extend contracts.

**Interfaces:** Produces `PlaylistStore`, `Playlist`, `NormalizedImage` and functions defined above. Each successful mutation increments `version`; reject unknown IDs with 404 and invalid reorder/capacity with 422/409 respectively.

- [x] Write failing normalization tests for JPEG/PNG/static WebP, EXIF rotation and a 5000×3000 image: decoded output is JPEG, has correct orientation, is within 3840×2160 and keeps aspect ratio. Reject empty/corrupt/animated files, SVG renamed as JPEG and files over 10 MiB. Set a decoded-input ceiling of 40 megapixels to bound memory; test that ceiling.
- [x] Write transaction tests: persist order/version across reopening; deletion removes membership; reorder requires an exact permutation without duplicates; from four images, two concurrent adds yield exactly one success and five images. A failed batch changes neither playlist nor version. Inject metadata-write failure and assert previous durable state remains valid.
- [x] Run `bun test tests/server/images.test.ts tests/server/playlist.test.ts`; expect failing tests.
- [x] Implement bounded Sharp decoding with actual detected-format checks, single-frame validation, orientation and JPEG conversion. Serialize all mutations; stage generated UUID-named files, atomically rename a same-directory metadata tempfile, then delete obsolete files. Never publish references to files not yet durable. On startup remove unreferenced staged files and reject corrupt/missing referenced data without silently resetting the playlist.
- [x] Run tests and typecheck; expect pass. Commit: `feat: add persistent five-image playlist`.

## Task 4: Authenticated upload, ordering and image HTTP routes

**Files:** Create `server/routes.ts`, `tests/server/routes.test.ts`; extend app and contracts.

**Interfaces:** Consumes Tasks 1–3. `POST /api/images` accepts multipart `images` fields and returns the complete Playlist (201); `DELETE /api/images/:id` returns Playlist (200); `PUT /api/playlist/order {ids:string[]}` returns Playlist (200). Read endpoints use the contract above. Read responses use `Cache-Control: no-store` so revoked access is not served from HTTP caches.

- [x] Write failing HTTP tests for 0/1/5 images, upload/delete/order, spoofed MIME validation, unauthorized reads/writes, and simultaneous uploads. Assert TV credentials in query parameters are rejected, not accepted as an alternate authentication path.
- [x] Test >10 MiB files and >51 MiB complete multipart requests return 413 before unbounded buffering; batches are all-or-nothing; traversal/unknown IDs return 404; errors omit file paths and credentials.
- [x] Test TV cross-origin fetch: preflight permits `GET` and `Authorization`, read responses work from packaged-TV origin without cookies, and no cross-origin credentialed write access is allowed. A packaged app may present an opaque origin: configure read-only CORS to allow `*` without credentials, relying on the bearer token.
- [x] Run `bun test tests/server/routes.test.ts`; confirm failures, then implement middleware order (body limits, read CORS, authorization, CSRF, handlers). Stream/check body limits before multipart parsing; limit normalization concurrency to avoid memory spikes.
- [x] Run `bun run test:server` and typecheck; expect all pass. Commit: `feat: expose protected image management API`.

## Task 5: React admin with a complete management journey

**Files:** Create the `admin/` files listed above, `playwright.config.ts`, `tests/e2e/admin.spec.ts`; extend server static serving and scripts.

**Interfaces:** `admin/src/api.ts` exports `getSession`, `login`, `logout`, `getPlaylist`, `uploadImages`, `removeImage`, `reorderImages`; session cookies stay HttpOnly, CSRF stays in memory. Images are loaded with the session, never a TV token.

- [x] Write failing browser tests: log in, upload five fixture images, see `5 / 5`, receive a useful sixth-file rejection, move an image up/down, delete it and log out. Assert failed writes do not falsely update displayed state; filenames are rendered as text. Use keyboard-accessible buttons rather than requiring drag gestures.
- [x] Run `bun run test:e2e -- tests/e2e/admin.spec.ts`; confirm failure against the running test server.
- [x] Implement the responsive login/editor UI with progress/error feedback, thumbnails and accessible labels. Fetch thumbnails as session-authorized resources; clean up any blob URLs. Recover from expired sessions by returning to login, and refresh server state after conflicting mutations.
- [x] Build using Vite to `dist/admin`; serve it through Hono with API routes taking precedence. Configure the Vite development API proxy; do not expose server configuration in client bundles.
- [x] Run `bun run build:admin`, `bun run typecheck` and the browser test; expect a usable built admin at the Bun server origin and passing journey. Commit: `feat: add React image administration`.

## Task 6: Deterministic slideshow and browser preview

**Files:** Create `tv/{player,transport}.js`, `tests/player/player.test.ts`, `tests/e2e/preview.spec.ts`, `admin/src/Preview.tsx`; extend `App.tsx` with `/preview`.

**Interfaces:** Produces `createPlayer`, transport and view contracts above. Both browser preview and TV use the same plain-JS player via a deliberate Vite import/asset boundary, with TypeScript declarations for admin consumers. TV transport fetches image bytes using Authorization, converts them to blob URLs, and releases URLs when no longer displayed; an `<img src>` alone cannot supply the token header. Admin transport uses its session.

- [x] Write failing fake-clock tests: empty manifest calls `showEmpty`; one image remains visible; five images advance at 2000 ms and wrap at 10000 ms; polling happens at 5000 ms independently of slide advancement.
- [x] Add tests: new set activates only after every download resolves; failed/404/slow images keep the old set; malformed or >5-item manifests are rejected; stale completions cannot resurrect an older playlist after an empty update or settings change; timed-out polls retry without overlap. `stop()` cancels timers, discards pending work, and releases blob URLs exactly once.
- [x] Run `bun test tests/player`; expect failures, then implement bounded fetch timeouts, response validation, generation IDs, complete-set swapping and cleanup. Only accept image paths matching `/api/images/<id>`; never send Authorization to an arbitrary URL from a manifest.
- [x] Implement `/preview` with the same black/contain/no-transition presentation and session-authenticated transport. Browser test asserts `Please upload`, advancing slides, live updates and continued playback after server/network failure; initial failure shows a distinct connection error.
- [x] Run `bun run test:player`, preview e2e, typecheck and admin build; expect pass. Commit: `feat: add resilient slideshow playback and preview`.

## Task 7: Remote-friendly webOS app and installable package

**Files:** Create remaining `tv/` files, `scripts/{check-tv.mjs,package-tv.ts}`, `tests/e2e/tv.spec.ts`, `docs/tv-installation.md`; extend scripts and player browser harness.

**Interfaces:** `settings.js` exports through `Signage` namespace `loadSettings(): {serverUrl,token}|null` and `saveSettings(value): void`; main creates the player with those settings. App ID `com.hadespipe.digitalsignage`, title `Digital Signage`, initial version `0.1.0`.

- [x] Write failing browser tests against the actual TV HTML: remote arrows navigate setup, OK activates controls, URL/token persist, hidden controls do not capture focus, and no settings overlay appears during normal playback. Use a browser-only TV harness served from a different origin from the API to exercise real CORS.
- [x] Add tests for malformed URL, rejected production HTTP, wrong token, localStorage failure, and changed server/token while downloads are pending. Permit HTTP only through an explicit LAN-test setting, clearly labeled. Never render token in player status or errors.
- [x] Implement HTML/CSS/JS targeting Chromium 79, with password-type token input, visible focus and recoverable setup errors. A long OK press (1500 ms) during playback opens settings; short OK does not. Back (webOS key 461) closes settings when configured; Back at the root hands exit to the webOS-supported platform behavior. Isolate platform calls behind a guard for browser tests and verify current LG guidance during implementation.
- [x] Add a compatibility check parsing JS with an ECMAScript 2019 ceiling, inspect used Web APIs against Chromium 79, and use a Chromium 79 build/emulator if available. Modern Playwright alone is not evidence of old-engine compatibility. Create valid PNG icons and appinfo; invoke official webOS packaging tools from `bun run package:tv`, output under ignored `dist/tv/` and inspect packaged metadata/assets. Fail clearly if CLI is missing.
- [x] Run TV browser tests, `bun run check:tv` and `bun run package:tv`; expect green tests and a nonempty `.ipk`. Document unrun engine/hardware checks accurately. Commit: `feat: package LG webOS player`.

## Task 8: Docker verification, setup documentation and TV acceptance

**Files:** Create deployment files, `tests/server/container.test.ts`, `docs/{deployment,verification}.md`; complete `docs/{development,tv-installation}.md` and README.

**Interfaces:** Single Bun server container port 3000, persistent volume `/data`, health endpoint `/api/health`; React build included, secrets supplied at runtime. `bun run test:container` exercises a built/running container against temporary data.

- [x] Write container smoke assertions for login/session/CSRF, image decode/upload, read-token authorization and persistent playlist after container recreation with the same volume. Run and record the expected pre-implementation failure; this is the Bun/native-dependency compatibility gate for the chosen Linux base and architecture.
- [x] Implement a reproducible Docker build using pinned tested Bun/dependency versions, non-root writable `/data`, explicit request/memory limits, healthcheck and `.dockerignore` excluding `.git`, env secrets, uploads, test reports and local dependencies. Explain HTTPS termination and `PUBLIC_ORIGIN`; never claim support for multiple writers/replicas.
- [x] Run `bun run typecheck`, server/player/e2e tests, admin build, TV check/package and container tests. Record versions, architecture, commands and results in `docs/verification.md`; if Docker or hardware is unavailable, record the block and leave that acceptance item open.
- [x] Document clean checkout setup, password-hash/token generation, LAN URL/firewall access, persistent storage backups, token rotation, session restart behavior, production HTTPS and troubleshooting. Keep tokens out of example URLs and screenshots. Supply TV Developer Mode/Key Server pairing, install/launch commands, remote controls, and manual session renewal instructions; no store publishing or live hosting purchase.
- [ ] With the user's TV reachable and Developer Mode enabled, install the `.ipk` and verify remote setup, image fit/orientation, 0/1/5-image behavior, 2-second timing, 5-second polling plus download time, network loss/recovery, updated playlist and Back. Record actual results separately from browser tests; do not mark hardware acceptance complete merely because packaging passes.
- [x] Update README with actual run/build/install commands and honest readiness. Commit: `chore: verify deployment and document TV installation`.

## Execution and Completion

Implement Tasks 1–8 in order. These are dependent slices of one product, not independently deployable subsystems, so one plan keeps the HTTP/player contracts aligned. Create an isolated `codex/` implementation branch/worktree at execution time. Review each commit's changed files and run its focused checks; run the complete suite once at integration unless a later change invalidates it.

The deliverable is source, built admin and `.ipk`, tested deployment instructions and a verification record. Live hosting and real-TV verification may require the user's environment; report those as pending when unavailable, while completing every local deliverable. Never claim a deployment or hardware test that was not performed.

Self-review completed: all approved spec sections map to Tasks 1–8; interface names match; the five Review Focus cases have assigned tests; no implementation scaffolding or dependency installation is part of this planning change.

## Primary References for Implementation

- Hono/Bun integration: https://hono.dev/docs/getting-started/bun
- Sharp platform/runtime prerequisites: https://sharp.pixelplumbing.com/install/
- LG engine/API compatibility: https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- LG package/install workflow: https://webostv.developer.lge.com/develop/getting-started/build-your-first-web-app
- LG Developer Mode lifecycle: https://webostv.developer.lge.com/develop/getting-started/developer-mode-app


## Acceptance status recorded 2026-11-07

Checked implementation/command-recording items mean the work and available local
checks are complete; they do not imply blocked platform acceptance passed.
Task 7 compatibility now includes actual packaged-app execution on the LG
OLED48C1PTB (webOS 6.5.3, Chrome 79.0.3945.79).

- [ ] Linux Docker/Bun/native sharp compatibility and memory acceptance (Docker unavailable).
- [x] Physical LG installation, persistent configuration, 0/1/5 images and measured 2-second slides.
- [x] Actual-engine simulated API-outage playback and synthetic settings long-OK/Back.
- [ ] Manual physical remote/virtual keyboard/platform exit, trusted HTTPS and TV power-cycle acceptance.

Full commands, results and artifact inspection: [verification](../../verification.md).
