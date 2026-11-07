# LG webOS installation

Target: OLED48C1PTB, webOS 6.0 / Chromium 79. App ID `com.hadespipe.digitalsignage`, version `0.1.0`.

Install dependencies with `bun install`; run `bun run check:tv` and `bun run package:tv`. The wrapper invokes the pinned official `@webos-tools/cli` 3.2.6 through Node and writes `dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk`. Node must be on PATH. A missing CLI fails with installation guidance. Keep Bun on PATH when running package scripts.

Enable Developer Mode and Key Server on the television, pair the developer workstation using LG's `ares-setup-device` / `ares-novacom --getkey`, then use the locally installed `node_modules/.bin/ares-install --device DEVICE dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk` and `ares-launch --device DEVICE com.hadespipe.digitalsignage`. Never commit device addresses, pairing keys or TV tokens. Developer Mode renewal is manual.

Enter the HTTPS server origin and read-only TV token. Plain HTTP requires checking **Allow HTTP for LAN testing only**. Settings persist in localStorage; the password field masks the token. Arrow keys move between controls, OK activates a checkbox/button or the platform input keyboard. Hold OK for 1500 ms during playback to change settings. Back closes settings; at the app entry point LG handles exit using its default History API behavior (`disableBackHistoryAPI: false`). Settings history entries contain no credentials. No webOSTV.js or unsupported global is assumed. See [LG Back guidance](https://webostv.developer.lge.com/develop/guides/back-button) and [official CLI installation](https://webostv.developer.lge.com/develop/tools/cli-installation).

Failures display a recoverable settings form with a generic connection/token error. Save validates connectivity before persisting; only successfully committed settings stop the previous player and abort its pending requests. Canceled or failed candidate settings preserve the loaded slideshow. TV credentials travel only in Authorization headers. The distinct-origin browser harness (3188 TV, 3187 API) exercises the existing read-only CORS implementation, including browser preflight.

`check:tv` parses every runtime JS file with Acorn's ECMAScript 2019 ceiling. APIs used (fetch, AbortController, URL/blob URLs, Image load events, Promise, localStorage, History API and keyboard events) exist in Chromium 79. CSS uses flexbox and object-fit, with explicit position edges rather than newer inset. Initial verification used syntax/API review and modern browsers. Later on 2026-11-07, the actual OLED48C1PTB ran the packaged app on webOS 6.5.3 / Chrome 79.0.3945.79: install, settings persistence across app relaunch, image decoding/slideshow/timing, simulated request failure, and synthetic-key long-OK/settings-Back checks passed. Manual physical remote/virtual keyboard/platform exit and TV power-loss checks remain unverified. No offline restart or auto-launch guarantee is provided.

## Pair and install

### Slideshow crossfade (Issue #2)

TV and browser preview use the same player and two-layer image renderer. The first
image appears immediately; subsequent slides hold for 1,700 ms, then fade the
incoming image over the opaque base with a linear 300 ms opacity transition.
The player commits at the 2,000 ms boundary, including last-to-first wrap; it does
not wait an extra 300 ms. A late display-image load retains the base and falls
back to a cut at the boundary. Reduced motion disables fading while retaining the
same cycle. New complete playlists replace immediately and reset the cycle;
empty playlists clear both layers and show `Please upload`.

Images still use `contain`; black letterboxing remains when aspect ratios differ.
Issue #3 (fill/crop) is excluded. This package's crossfade has browser coverage
and an ES2019 syntax check, but has **not** been installed or verified on the LG:
the current device SSH authentication failed. Earlier physical-device checks
below describe the previous immediate-cut implementation, not this crossfade.

## Installation steps

On the TV, install **Developer Mode** from LG Apps, sign in with an LG developer
account, enable **Dev Mode Status**, and allow the requested restart. Open the
Developer Mode app again and enable **Key Server**. Keep TV and workstation on the
same network; Developer Mode SSH uses port 9922. Find the current TV address in
its network settings, without committing it to this repository.

```sh
node_modules/.bin/ares-setup-device
# Add a device named signage-tv: TV address, port 9922, user prisoner.
node_modules/.bin/ares-device --device signage-tv --system-info
node_modules/.bin/ares-novacom --device signage-tv --getkey
# Enter the passphrase displayed by the TV's Key Server.
node_modules/.bin/ares-install --device signage-tv dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk
node_modules/.bin/ares-launch --device signage-tv com.hadespipe.digitalsignage
```

If pairing fails, check Dev Mode Status, Key Server, passphrase, same network and
TCP 9922 before retrying. A reachable TV control service does not establish SSH
availability. Device installation was subsequently performed successfully; see the dated verification record. Use `ares-device --system-info`, because the current CLI deprecates `ares-device-info`.

Developer Mode has a limited session duration shown in its app. Open it and
manually use **EXTEND** before expiry; inspect the remaining time regularly.
Expiry or disabling Developer Mode can remove developer-installed apps. Re-enable,
pair and reinstall if required. There is no automatic renewal, store publishing,
auto-launch, or guarantee that a cached slideshow survives restart.

## Physical acceptance checklist (partly verified)

After pairing, separately record model/firmware/date and actual observations:

- [x] Install and launch the packaged app on OLED48C1PTB (actual runtime webOS 6.5.3).
- [ ] Use arrows/OK, platform keyboard and hold-OK settings; confirm masked token persistence after relaunch.
- [x] Check empty `Please upload`, one stationary image, five images and two-second timing (four measured intervals: 2000 ms each).
- [ ] Check full-image fit, black letterboxing, portrait/landscape and EXIF orientation.
- [ ] Upload/reorder/delete; confirm five-second polling plus download time and no partial-set display.
- [ ] Disconnect/reconnect network; playback continues in memory and updates recover.
- [ ] Check Back from settings and Back exits at the app entry point.
- [ ] Check trusted HTTPS and separately record restart/power-loss behavior.

Actual TV Chromium 79 execution is now verified. Masked settings persistence after
app close/relaunch and long-OK/settings-Back using synthetic key events passed.
Landscape 1600×900 images rendered with `object-fit: contain`; blocking only this
app's API requests through its inspector preserved three slide changes, and
unblocking plus deleting test images restored `Please upload`. These do not
substitute for manual remote/virtual-keyboard/platform-exit, portrait/EXIF visual,
physical Wi-Fi disconnection, trusted HTTPS or TV restart/power-loss acceptance.

Reference: [LG Developer Mode pairing and session extension](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).
