# Digital Signage

A planned web admin and LG webOS TV app for displaying an image slideshow.

## Requirements

- Target TV: LG OLED48C1PTB (webOS 6.0).
- Install the TV app through LG Developer Mode.
- Upload up to 5 images through a web admin.
- Cycle through images every 2 seconds.
- Display `Please upload` when the image list is empty.

## Status

Design draft only. Application implementation has not started.

## Confirmed technology stack

- Web admin and browser preview: React + TypeScript + Vite, built as static files.
- Server: TypeScript on Bun with Hono, serving the API, admin files, and images.
- TV app: plain HTML/CSS/JavaScript compatible with webOS 6.0 (Chromium 79), packaged separately as an `.ipk`.
- Bun dependency compatibility must be verified on the target Docker/OS environment before production use; no performance improvement over Node.js is assumed.

See [the design document](docs/superpowers/specs/2026-11-07-digital-signage-design.md) for confirmed requirements and proposed implementation details.
