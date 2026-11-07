# Slideshow Crossfade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 300 ms crossfade to TV playback and browser preview within the existing 2,000 ms slide cycle, implementing Issue #2 only.

**Architecture:** Keep `tv/player.js` as the single timing and resource owner. It announces a transition at 1,700 ms and commits the next image at 2,000 ms; the two views render an opaque base image plus an incoming opacity layer. Immediate image/empty/stop operations clear incoming layers synchronously before releasing old resources.

**Tech Stack:** Existing ES2019 classic scripts for Chromium 79, React/TypeScript/Vite, CSS opacity, Bun tests, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-07-slideshow-crossfade-design.md` — approved by the user.

## Global Constraints

- Work on `codex/slideshow-crossfade`, never `main`; preserve unrelated `.serena/` and `skills/` files.
- First image appears immediately; hold 1,700 ms, fade 300 ms, complete at 2,000 ms; next completion at 4,000 ms.
- Incoming image fades linearly from opacity 0 to 1; outgoing base stays opaque. No fade through black.
- Preserve `contain`, complete image proportions, black background, 5,000 ms polling and existing authorization. Issue #3 is excluded.
- Zero images show exact text `Please upload`; one image stays still. Fully loaded new sets replace immediately and reset the cycle.
- Reduced motion cuts at 2,000 ms; no fade or extra wait. No per-slide network requests.
- Keep Chromium 79 support; no animation framework. Actual hardware evidence is separate from desktop/browser/package evidence.

## Review Focus

1. An old completion firing after a new set/empty/stop must never restore a stale image — Task 1 fake-clock tests and Task 3 browser tests.
2. Two layers must not reference revoked blob URLs — Task 1 release-order assertions and Task 3 replacement tests.
3. Identical timing must reach TV and preview without rendering two accessible “Display image” elements — Task 2 tests and selectors.
4. Reduced motion, including a preference change during fade, must settle correctly at the same slide boundary — Task 2 browser tests.
5. Delayed display-image readiness or interrupted rendering must retain a valid base, rather than expose black/broken-image content — Task 2 readiness test and Task 3 hardware gate.

## File Map

- Modify `tv/player.js`, `tv/player.d.ts`: phase scheduling, required view contract, cancellation and resource release ordering.
- Modify `tests/player/player.test.ts`: existing fake clock, timed view events and lifecycle assertions; update every player mock affected by the contract.
- Modify `tv/main.js`, `tv/index.html`, `tv/style.css`: incoming image layer and renderer wiring; preserve settings behavior.
- Modify `admin/src/Preview.tsx`, `admin/src/style.css`: same rendering rules inside preview only; use refs for synchronous layer cleanup where React batching would otherwise delay it.
- Modify `tests/e2e/preview.spec.ts`, `tests/e2e/tv.spec.ts`: browser rendering and lifecycle regressions using existing harness/auth/setup.
- Modify `docs/tv-installation.md`, `docs/verification.md`, the main design spec's slideshow bullet, and this feature spec's status: document approved behavior and actual results. Keep the old implementation plan as a historical record.
- Inspect `tv/transport.js`; keep existing preloading/release implementation unless tests prove it must change. `scripts/check-tv.mjs` already checks every TV `.js`; packaging includes the TV directory.

### Task 1: Shared timing and lifecycle contract

**Interfaces:** `Signage.createPlayer` keeps existing transport/start/stop/clock contracts. Its required view becomes `showImage(url: string): void`, `beginTransition(url: string, durationMs: number): void`, `clear(): void`, `showEmpty(): void`, `showError(): void`. `showImage` commits immediately and cancels an incoming visual; `clear` synchronously removes both layers without replacing status messages. `beginTransition` never owns playlist resources or slide timers. Reduced-motion suppression belongs to the view, so the player always commits at the same boundary.

- [ ] Extend the existing `setup()` fixture with timestamped `showImage`/`beginTransition`/`clear` events and release ordering. Add `crossfade stays inside the two-second cycle`, asserting the equivalent of:

  ```ts
  expect(events).toEqual([
    [0, "show", "/api/images/a"],
    [1700, "fade", "/api/images/b", 300],
    [2000, "show", "/api/images/b"],
    [3700, "fade", "/api/images/a", 300],
    [4000, "show", "/api/images/a"],
  ]);
  ```

- [ ] Add tests for no fade with 0/1 images; five-image wrap; stop at 1,850 ms followed by restart; new set and empty activation during a fade. Trigger polling during fade by activating the first set at a controlled delayed time (for example T=3,200 ms makes the 5,000 ms poll land at T+1,800 ms). Assert old completion never fires, both layer references are cleared before old releases, and the new set starts a fresh cycle. Preserve slow/failing loads and independent polling assertions.
- [ ] Run `bun run test:player`; confirm new tests fail specifically because transition/clear events are missing.
- [ ] Implement the two phases in `tv/player.js`: 1,700 ms to `beginTransition(nextUrl, 300)`, then 300 ms to advance index and `showImage(nextUrl)`, then schedule the next cycle. Cancel both phases on set activation and stop; protect stale callbacks with the existing lifecycle/generation approach. Clear view references before `release(previous)` / `release(active)`. Do not tie completion or future scheduling to CSS `transitionend`.
- [ ] Update `tv/player.d.ts` and every `createPlayer` caller/mock found with `rg -n 'createPlayer|showImage' tv admin tests`. In TV and preview add a temporary no-op `beginTransition` and a real synchronous `clear`; the intermediate commit preserves existing immediate-cut playback until Task 2. For preview use an image ref so `clear` removes `src` synchronously before player releases resources, rather than relying on a queued React state change.
- [ ] Run `bun run test:player` and `bun run typecheck`; expect all tests and types to pass. Check every existing `shown` assertion still represents commits at 2,000 ms.
- [ ] Commit only Task 1 files with `feat(player): schedule crossfade within slide cycle`.

### Task 2: Render both views with opaque base and incoming layer

**Interfaces:** Consume Task 1's required view methods. Preserve base `#display` on TV and accessible name `Display image` in both views. Incoming images are decorative (`alt=""`, `aria-hidden="true"`) and cannot intercept controls. Each view's `showImage`/`clear` must synchronously cancel animation, detach incoming sources/load callbacks and reset layers; React may continue to own status/error state.

- [ ] Add browser tests in both existing specs using two real, decoded contrasting images. Observe a natural transition, sample computed opacity using `requestAnimationFrame`, and assert `base.opacity === 1`, `0 < incoming.opacity && incoming.opacity < 1`, both images loaded (`naturalWidth > 0`), overlapping viewport bounds, and computed fade duration of 300 ms with linear easing. Assert completion hides the incoming layer and commits its URL to the base, including last-to-first. Keep existing role-based image assertions unambiguous.
- [ ] Add reduced-motion tests using `page.emulateMedia({ reducedMotion: "reduce" })`: no incoming layer appears and base changes at the shared 2,000 ms boundary. Change preference mid-fade and assert the incoming layer disappears while the valid base remains until the boundary. For browser timing avoid exact wall-clock equality; exact timing belongs to Task 1.
- [ ] Add a readiness regression: delay the incoming display element's ready callback while using an already fetched blob; base stays decoded and visible, late callbacks after clear cannot resurrect the incoming image. Use the existing browser harness with a narrowly scoped injected image readiness hook, not production-only configuration. No additional network fetch is allowed for fade.
- [ ] Run `bun run test:e2e tests/e2e/preview.spec.ts tests/e2e/tv.spec.ts`; confirm new rendering assertions fail against the no-op transition views.
- [ ] Add a second image to TV markup and preview. Stack layers with explicit top/right/bottom/left edges in TV CSS, keeping the base opaque and `object-fit: contain` on both. Implement `beginTransition(url, durationMs)` with CSS opacity transition, reset to opacity 0 before starting, and allow a rendering boundary before setting opacity 1. Cancel any readiness listeners and pending animation frames on commit/clear. If readiness is late, keep the base visible and use an immediate commit at the scheduled boundary rather than extend the cycle.
- [ ] Wire `matchMedia("(prefers-reduced-motion: reduce)")` in both views; use Chromium-79-compatible listener APIs and remove listeners on teardown. Switching to reduce cancels the incoming visual immediately; switching back enables the next scheduled transition, without restarting one mid-cycle. Readiness and frame callbacks must carry a cancellation guard. Do not animate settings/status/editor thumbnails or add general configuration.
- [ ] Ensure `showImage` at the scheduled boundary synchronously sets a valid base and clears the incoming layer; `showEmpty` and stop clear both sources first. TV settings still recover as before. Preview effect cleanup calls `player.stop()` before tearing down its view; use refs for imperative source/animation operations and avoid React independently overwriting the same attributes.
- [ ] Run `bun run typecheck`, `bun run test:player`, the two browser specs, `bun run build:admin`, and `bun run check:tv`; expect success. Inspect CSS scope to confirm thumbnail styles and `contain` remain unchanged.
- [ ] Commit Task 2 files with `feat: crossfade TV and preview images over 300ms`.

### Task 3: Interruptions, integration evidence and documentation

**Interfaces:** Exercise the final player/view contract without new application APIs. Use existing authenticated upload/playlist and TV setup helpers; keep credentials out of artifacts/logs.

- [ ] Add browser regressions for a fully loaded replacement and confirmed empty during fade, then wait beyond the old completion and assert only the new state remains. Instrument `URL.revokeObjectURL` in the test page to assert neither layer references a URL when it is revoked. Verify pending new downloads and failed updates keep the old slideshow playing, then recover normally.
- [ ] Add preview navigation/unmount during fade and TV committed-settings change during fade; assert no stale source/load callback restores old content. Preserve cancel-settings/Back behavior and verify long-OK opens settings over playback. Exercise 0/1/5 image states and offline playback using existing tests rather than duplicate full admin journeys.
- [ ] Run the new cases first, fix only demonstrated integration defects, then run the full relevant gates: `bun run typecheck`, `bun run test:player`, `bun run test:server`, `bun run test:e2e`, `bun run build:admin`, `bun run check:tv`, `bun run package:tv`, and `git diff --check`. Record actual outcomes; do not claim unrun gates passed. Container work is outside this frontend/player change.
- [ ] Update the main design's “no transition” rule to reference this approved crossfade spec while retaining `contain`. Mark the feature spec approved, update the TV guide, and append new verification evidence without rewriting earlier historical results. Record that Issue #3 remains excluded.
- [ ] If the LG TV is reachable, install the freshly packaged app and test 300 ms fade, final-to-first wrap, 2-second cadence, 0/1/5 states, playlist changes, settings and actual visual continuity. Record device/version and observations. Otherwise mark hardware acceptance explicitly NOT RUN; package/browser success is not hardware acceptance. Record compositor or image-readiness risks still requiring hardware confirmation.
- [ ] Self-review the entire diff against the approved spec, especially release ordering, pending callbacks, animation reset and no per-slide network request. Commit Task 3 changes with `test: verify crossfade interruptions and document results`.

## Execution Handoff

Recommended method: **Native**, implementing sequentially in this session and performing one independent final review. The three tasks share a small view contract and timing owner; sequential implementation keeps coordination low. No implementation, branch push, PR creation or deployment is part of writing this plan. Request plan review and execution-method selection before starting product changes.
