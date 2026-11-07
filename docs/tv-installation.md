# LG webOS installation

Target: OLED48C1PTB, webOS 6.0 / Chromium 79. App ID `com.hadespipe.digitalsignage`, version `0.1.0`.

Install dependencies with `bun install`; run `bun run check:tv` and `bun run package:tv`. The wrapper invokes the pinned official `@webos-tools/cli` 3.2.6 through Node and writes `dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk`. Node must be on PATH. A missing CLI fails with installation guidance. Keep Bun on PATH when running package scripts.

Enable Developer Mode and Key Server on the television, pair the developer workstation using LG's `ares-setup-device` / `ares-novacom --getkey`, then use the locally installed `node_modules/.bin/ares-install --device DEVICE dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk` and `ares-launch --device DEVICE com.hadespipe.digitalsignage`. Never commit device addresses, pairing keys or TV tokens. Developer Mode renewal is manual.

Enter the HTTPS server origin and read-only TV token. Plain HTTP requires checking **Allow HTTP for LAN testing only**. Settings persist in localStorage; the password field masks the token. Arrow keys move between controls, OK activates a checkbox/button or the platform input keyboard. Hold OK for 1500 ms during playback to change settings. Back closes settings; at the app entry point LG handles exit using its default History API behavior (`disableBackHistoryAPI: false`). Settings history entries contain no credentials. No webOSTV.js or unsupported global is assumed. See [LG Back guidance](https://webostv.developer.lge.com/develop/guides/back-button) and [official CLI installation](https://webostv.developer.lge.com/develop/tools/cli-installation).

Failures display a recoverable settings form with a generic connection/token error. Save validates connectivity before persisting; changed settings stop the previous player and abort pending requests. TV credentials travel only in Authorization headers. The distinct-origin browser harness (3188 TV, 3187 API) exercises the existing read-only CORS implementation, including browser preflight.

`check:tv` parses every runtime JS file with Acorn's ECMAScript 2019 ceiling. APIs used (fetch, AbortController, URL/blob URLs, Image load events, Promise, localStorage, History API and keyboard events) exist in Chromium 79. CSS uses flexbox and object-fit, with explicit position edges rather than newer inset. This is a syntax/API review plus modern-browser testing, **not execution on Chromium 79**. No Chromium 79 engine/emulator was available and physical TV installation/remote keyboard/Back-exit/localStorage lifecycle remain unverified. No offline restart or auto-launch guarantee is provided.

## Pair and install

On the TV, install **Developer Mode** from LG Apps, sign in with an LG developer
account, enable **Dev Mode Status**, and allow the requested restart. Open the
Developer Mode app again and enable **Key Server**. Keep TV and workstation on the
same network; Developer Mode SSH uses port 9922. Find the current TV address in
its network settings, without committing it to this repository.

```sh
node_modules/.bin/ares-setup-device
# Add a device named signage-tv: TV address, port 9922, user prisoner.
node_modules/.bin/ares-novacom --device signage-tv --getkey
# Enter the passphrase displayed by the TV's Key Server.
node_modules/.bin/ares-install --device signage-tv dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk
node_modules/.bin/ares-launch --device signage-tv com.hadespipe.digitalsignage
```

If pairing fails, check Dev Mode Status, Key Server, passphrase, same network and
TCP 9922 before retrying. A reachable TV control service does not establish SSH
availability. TV installation was not performed during this verification.

Developer Mode has a limited session duration shown in its app. Open it and
manually use **EXTEND** before expiry; inspect the remaining time regularly.
Expiry or disabling Developer Mode can remove developer-installed apps. Re-enable,
pair and reinstall if required. There is no automatic renewal, store publishing,
auto-launch, or guarantee that a cached slideshow survives restart.

## Physical acceptance checklist (pending)

After pairing, separately record model/firmware/date and actual observations:

- [ ] Install and launch the packaged app on OLED48C1PTB / webOS 6.0.
- [ ] Use arrows/OK, platform keyboard and hold-OK settings; confirm masked token persistence after relaunch.
- [ ] Check empty `Please upload`, one stationary image, five images and two-second timing.
- [ ] Check full-image fit, black letterboxing, portrait/landscape and EXIF orientation.
- [ ] Upload/reorder/delete; confirm five-second polling plus download time and no partial-set display.
- [ ] Disconnect/reconnect network; playback continues in memory and updates recover.
- [ ] Check Back from settings and Back exits at the app entry point.
- [ ] Check trusted HTTPS and separately record restart/power-loss behavior.

Modern browser tests and `.ipk` inspection do not close these checks. Chromium 79
execution and physical TV power-loss acceptance are still unperformed.

Reference: [LG Developer Mode pairing and session extension](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).
