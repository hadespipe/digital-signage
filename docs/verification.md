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
| Actual Chromium 79 engine | **PASS** — packaged app on physical LG, Chrome 79.0.3945.79; see device observations below |
| Physical TV install/image/timing/recovery | **PASS** for the checks recorded below; manual physical remote/keyboard/platform exit still pending |
| App close/relaunch settings persistence | **PASS** on physical LG |
| Physical TV power cycle and filesystem power-loss durability | **NOT RUN** |

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

No live hosting, public deployment, Developer Mode auto-renewal or complete physical-TV
acceptance is claimed. Only the device checks recorded below are established. Complete the pending checklist in [TV installation](tv-installation.md)
and Linux gate in [deployment](deployment.md) before production acceptance.

## Final review fixes — 2026-11-07

Focused browser regressions first reproduced the review findings against the
unchanged runtime: `bun run test:e2e tests/e2e/tv.spec.ts --grep 'offline loaded|startup outage'`
failed four cases (loaded real image lost after Back with unchanged/failed
settings; recovered image/empty still obscured by automatic settings); the edited
form guard passed. This RED run was 4 failed / 1 passed, 44.0 seconds.

After the fix, `bun run test:player` passed 10 tests / 34 assertions.
`bun run typecheck`, `bun run check:tv`, `bun run package:tv`,
`bun run build:admin`, and `git diff --check` passed. The package command also
reran the ES2019 check. Commands ran with `$HOME/.bun/bin` added to PATH;
initial player/package invocations without that PATH failed because nested
scripts could not locate Bun, then passed after correcting PATH.

The regenerated `.ipk` is 7,616 bytes, SHA-256
`e646998da5879386eace8604ab1c18586d67e3a8ba77c62613a6c2de897753fc`.
This supersedes the earlier package size/hash only; no new extraction or physical
TV execution is claimed. A header-link contrast refinement was attempted, but final review found the
selector does not match the current markup. That cosmetic change is not verified
as effective and is recorded below as a nonblocking follow-up.

`bun run test:e2e tests/e2e/tv.spec.ts tests/e2e/preview.spec.ts` passed
16 tests in 57.6 seconds (the preceding focused run also passed 16 in 57.4s).
Coverage retains pending-validation Back, failed persistence, root-history save,
old-download cancellation after held candidate validation/commit, real-image
offline Back, automatic image/empty recovery, and preservation of edited settings.

After treating remote Enter on automatic settings as intentional interaction,
`bun run test:e2e tests/e2e/tv.spec.ts --grep 'remote navigation|startup outage recovers unobscured editing'`
passed 2 tests in 8.5 seconds; typecheck and diff whitespace checks passed again.


## Controller final integration check — 2026-11-07

On final source commit `fdfd869`, the controller independently ran:

- `bun run typecheck`: PASS.
- `bun test tests/server tests/player`: **44 passed, 0 failed, 190 assertions**.
- `bun run build:admin`: PASS, 19 modules.
- `bun run test:e2e`: **20 passed in 59.7 seconds** (full admin/preview/TV suite).
- `bun run check:tv`: PASS for all four runtime scripts.
- Read the generated IPK's real data archive with `ar`/`tarfile` and compared
  `main.js`, `player.js`, `transport.js`, `settings.js`, `index.html`, `style.css`
  and `appinfo.json` byte-for-byte with the final source: **all match**.
- Actual configured local-server health, password login, authorized empty
  playlist and built admin: all HTTP 200; no credentials printed.
- Actual local-server Chromium desktop/mobile login smoke: PASS, no page errors
  and no horizontal overflow at 390px.
- `git diff --check`: PASS; local `.env` and uploaded `data/` remain ignored.

Whole-branch review plus its single scoped fix review confirms both reproduced
TV lifecycle findings addressed and no remaining Critical/Important findings.
Nonblocking follow-up: `admin/src/style.css` targets `header nav a`, while the
Preview link is directly under the header, so the contrast refinement does not
take effect. The link remains functional; CSS polish is deferred.

These final results supersede the earlier full-suite test count. Docker/Linux,
manual physical remote/keyboard/exit and TV power-cycle gates remain open. Actual
Chromium 79 and the physical-device checks below were subsequently verified.
See [implementation decisions](implementation-decisions.md) for rulings.


## Actual LG device observations — 2026-11-07

Using the official pinned LG CLI, paired the workstation, installed the exact
verified `.ipk`, and launched `com.hadespipe.digitalsignage`. `ares-device -i`
reported OLED48C1PTB, sdkVersion 6.5.3 and firmware 03.53.45. The app inspector's
actual user agent reported Chrome/79.0.3945.79 WebAppManager. Device addresses,
pairing credentials and TV read tokens are not recorded in this repository.

- Submitted the app's real settings form on the device with the LAN test server
  and read-only token. Actual authorized cross-origin requests succeeded; the
  settings overlay closed and the empty view showed exactly `Please upload`.
- Uploaded a temporary JPEG through the real server: the TV decoded 1600×900,
  rendered with `object-fit: contain` and held one image stationary.
- Added four distinct temporary JPEGs: the actual TV cycled five unique image
  URLs, with four complete measured intervals of **2000, 2000, 2000, 2000 ms**.
  Sampling used the actual TV's `performance.now()` at 100 ms intervals.
- Simulated failure by blocking only this app's LAN API URLs through its
  inspector (not disconnecting the household Wi-Fi). Over 6.5 seconds, three
  further image changes remained visible with the settings panel hidden.
- Removed the request block and deleted the temporary test images: zero images
  remained and the TV returned to unobscured `Please upload`.
- Closed/relaunched this app through the CLI: stored configuration and token
  persisted, playback reconnected without opening setup. Synthetic Enter hold
  and key 461 events in the actual engine opened/closed settings and the token
  input remained masked. These are not manual physical-remote tests.
- Captured and inspected actual device screenshots of empty and image playback.

Still pending: Linux container/native Sharp/memory acceptance; manual remote
virtual keyboard and root platform exit; trusted production HTTPS; portrait/EXIF
visual checks; actual Wi-Fi disconnection/reconnection; TV power cycle, power-loss
and long-duration soak. No broader physical-device claim is implied.

## Crossfade implementation — 2026-11-07

Branch `codex/slideshow-crossfade` implements approved Issue #2: linear 300 ms
incoming-image fade inside the 2,000 ms cycle. TV and preview share timing,
transport and DOM image rendering. `contain` is unchanged; Issue #3 is excluded.

| Command/check | Actual crossfade result |
| --- | --- |
| `bun run typecheck` | PASS |
| `bun test tests/server tests/player` | PASS — 48 tests, 224 assertions |
| `bun run test:e2e` | PASS — 32 tests, 1.9 minutes, Playwright Chromium 158 |
| `bun run build:admin` | PASS |
| `bun run check:tv` | PASS — all five runtime scripts, including `image-view.js`, ES2019 |
| `bun run package:tv` | PASS — official LG CLI |
| IPK source comparison | PASS — renderer, player, main, HTML and CSS match source byte-for-byte |
| `git diff --check` | PASS |
| New crossfade on physical LG / Chromium 79 | **BLOCKED / NOT RUN** — configured LAN SSH port reachable, but official `ares-device --system-info` failed: `All configured authentication methods failed`; no new package installed |

Fake-clock tests assert 1,700 ms fade start, 2,000/4,000 ms commits, wrap,
0/1/5 states, stop/restart and complete/empty activation during fade. Browser
tests sample actual intermediate opacity and overlapping decoded image layers;
check linear 300 ms CSS duration, opaque base, wrap without more image requests,
reduced motion and live preference changes, delayed-ready callbacks, playlist
replacement/empty during fade, settings commit, navigation, and detachment before
blob URL revocation. Existing admin, authorization, offline playback and settings
regressions passed in the full suite.

Browser setup initially failed because the matching Chromium binary was absent.
After installing it, both new rendering tests failed against the Task 1
immediate-cut views (`No intermediate crossfade frame`) and passed with the
renderer. A later forced delayed-readiness retest passed both views. One
concurrent harness invocation failed because port 3187 was occupied; final runs
were sequential and passed.

Generated package: `dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk`, 8,588 bytes,
SHA-256 `3da971b432256b54b37a61de6a99c78b4361e2530cdbd91f46b414c728223ee6`.
This supersedes earlier artifact hashes, not earlier device observations. No new
physical-device fade/compositor/memory result is claimed. Re-pair the official
CLI before installing this package and observing actual smoothness on the TV.
Docker/Linux and the other earlier physical acceptance gaps remain unchanged.
