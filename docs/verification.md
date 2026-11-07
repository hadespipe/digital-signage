# Verification record — 2026-11-07

Executed on macOS 26.6.2 / arm64 with Bun 1.4.4 (38afee6c8), Node v26.8.1,
TypeScript 7.0.2, Vite 8.3.6, sharp 0.35.5 and @webos-tools/cli 3.2.6.
Dependencies are resolved by committed `bun.lock`; use `bun install --frozen-lockfile`.

| Command/check | Actual result |
| --- | --- |
| `bun run typecheck` | PASS |
| `bun run test:server` | PASS — 34 tests, 156 assertions |
| `bun run test:player` | PASS — 10 tests, 34 assertions |
| `bun run build:admin` | PASS — static HTML/CSS/JS under `dist/admin` |
| `bun run test:e2e` | PASS — 15 tests, 39.1 seconds, modern Playwright Chromium |
| `bun run check:tv` | PASS — main/player/settings/transport JS parsed at ES2019 ceiling |
| `bun run package:tv` | PASS — official CLI created nonempty `.ipk` |
| IPK extraction/metadata inspection | PASS — ar members, appinfo, HTML, CSS, four runtime JS files and PNG icons present |
| Temporary listener health/admin smoke | PASS — health ready, admin HTTP 200, SIGTERM drain exits 0 |
| Generated escaped Bun dotenv + actual listener/password login | PASS — login 200, shutdown exits 0; secrets were not printed |
| `bun run test:container` | **BLOCKED / exit 1** — Docker executable unavailable |
| Linux container Bun/native sharp compatibility + memory sizing | **NOT RUN** |
| Chromium 79 engine/emulator | **NOT RUN** — modern Chromium is not old-engine evidence |
| Physical TV install/remote/image/timing/recovery/Back | **NOT RUN** — Developer Mode SSH unavailable during discovery |
| Physical TV restart/power loss and filesystem power-loss durability | **NOT RUN** |

The Docker smoke was written and executed before the Dockerfile implementation;
it failed explicitly with `BLOCKED: Docker executable unavailable`. No Docker/VM
was installed. The opt-in test is `tests/container/compatibility.test.ts`, outside
the ordinary server suite, and **never silently skips**. When Docker is available,
it builds the pinned Debian/Bun image, starts with a temporary named volume and
runtime credentials, checks static admin, health, login, CSRF rejection, actual PNG
upload/JPEG read with TV header authorization, then recreates the container with
the same volume and checks identical playlist plus invalidated admin session.
Rerun `bun run test:container` on the intended Linux architecture before acceptance.

The `.ipk` inspected in this run:

- Path: `dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk`
- Size: 7,348 bytes
- SHA-256: `35ee7bd6d9e8cf3fb46660950cc3b9e40574aa12a9eefc6ecec34130e329b5ba`
- App ID/version: `com.hadespipe.digitalsignage` / `0.1.0`
- Entry: `index.html`; `disableBackHistoryAPI: false`; resolution `1920x1080`

Packaging timestamps can change archive hashes on later builds. Build artifacts
are generated locally and ignored by Git. Packaging does not demonstrate TV execution.

Browser coverage includes complete admin management, authorization recovery,
real decoded image preview, independent polling/sliding, continued playback during
network failure, distinct initial errors, TV cross-origin authorization/settings,
remote keys/long OK/Back, failed persistence and cancellation of stale requests.
Server coverage additionally verifies actual sharp formats/EXIF/dimensions/input
limits, serialized atomic playlist changes, startup recovery, exact write 401/403,
and third-upload 429 followed by available admission after failed body parsing.

Bun dotenv was checked separately: unescaped and single-quoted Argon2 dollar signs
were interpolated; `\$` preserved the hash. The documented escaped generator was
then used in a temporary env file to start the real server and authenticate.
Docker raw env files intentionally use unescaped values instead.

No live hosting, public deployment, Developer Mode auto-renewal or physical-TV
acceptance is claimed. Complete the pending checklist in [TV installation](tv-installation.md)
and Linux gate in [deployment](deployment.md) before production acceptance.
