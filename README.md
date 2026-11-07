# Digital Signage

Image signage for one administrator and one LG OLED48C1PTB (webOS 6.0) TV.
The React admin uploads/reorders/deletes up to five images; the TV displays whole
images on black every two seconds and polls for changes every five seconds.
Empty playlists show `Please upload`; network errors retain the in-memory set.

The application, admin build and installable TV package are implemented and locally
tested. Linux Docker/native sharp compatibility and real-TV/Chromium 79 acceptance
remain pending. This repository has not been deployed to live hosting.

Use Bun 1.4.4 and Node for the pinned LG CLI:

```sh
bun install --frozen-lockfile
cp .env.example .env
# Generate credentials and set the exact origin as described in docs/development.md.
bun run build:admin
bun start
bun run check:tv
bun run package:tv
```

Open your configured `PUBLIC_ORIGIN`, sign in and upload images. TV output is
`dist/tv/com.hadespipe.digitalsignage_0.1.0_all.ipk`; the static admin is `dist/admin`.
Generate runtime-only credentials before starting: [development](docs/development.md).
For Vite development run `bun run dev` and `bun run dev:admin` with the documented
5173 origin. For full checks and known limits see [verification](docs/verification.md).

[Deployment](docs/deployment.md) covers Docker, HTTPS, persistent storage and backups.
[TV installation](docs/tv-installation.md) covers Developer Mode, pairing, remote
controls and manual session renewal. Production requires HTTPS and a single writer;
there is no auto-renewal, auto-launch, video, scheduling or offline-restart guarantee.

See the [approved design](docs/superpowers/specs/2026-11-07-digital-signage-design.md)
and [implementation plan](docs/superpowers/plans/2026-11-07-digital-signage.md).
