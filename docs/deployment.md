# Deployment

One Bun process owns one persistent data directory. Do not scale replicas or share
that directory between writers. The server serves the built admin, API and JPEGs
on port 3000. Linux container acceptance is **blocked** until Docker is available;
the pinned `oven/bun:1.4.4-debian` base has not been run here. Local Bun 1.4.4
and sharp checks do not establish Linux native-library compatibility.

Follow [development setup](development.md) to generate credentials. Create a
private `.env.docker` (mode 600) containing the generated hash/token, your exact
`PUBLIC_ORIGIN` and `ALLOW_LAN_HTTP=false`. Use literal, unquoted values with
`docker run --env-file`; do not expand the hash in a shell. For Compose the supplied
`format: raw` requires Docker Compose 2.30.0 or newer and preserves `$` in password
hashes without interpolation. Unlike Bun `.env`, Docker raw env files need the
unescaped hash: remove each backslash before `$` from the development generator
output, or generate using `console.log(await Bun.password.hash(password))` instead.
Do not copy an escaped Bun hash directly into `.env.docker`. Never put secrets
into build arguments or images.

```sh
docker build -t digital-signage:local .
docker volume create signage-data
docker run -d --name signage --env-file .env.docker \
  --memory=2g --cpus=2 --stop-timeout=30 \
  -p 3000:3000 -v signage-data:/data digital-signage:local
# Or, with recent Docker Compose:
docker compose up -d --build
bun run test:container
```

The standalone command and Compose use distinct volume names; choose one workflow.
The image runs as `bun`, creates an owned `/data`, and keeps all uploads/metadata
there. Bind mounts must be writable by that user (verify the image UID with
`docker run --rm --entrypoint id digital-signage:local`). Named volumes inherit
ownership on first use. Do not use `docker compose down -v` on retained data.

The listener allows at most 51 MiB per request; uploads allow 10 MiB per file,
five files and two admitted requests, each decoding sequentially. Sharp rejects
inputs above 40 million pixels. The 2 GiB container memory limit is a conservative
starting allocation for two bounded decoders plus buffering, **not a measured Linux
acceptance result**. Test representative large images on your host/architecture
before production; OOM kills and power loss are not graceful shutdowns.

Put an HTTPS reverse proxy in front of port 3000 and configure its body limit to
at least 51 MiB. Set `PUBLIC_ORIGIN` to the exact browser-facing HTTPS origin,
including a nondefault port if used; preserve the browser Origin header. Secure
cookies follow this configured origin. Restrict direct port 3000 access to the
proxy in production. TLS certificates must be trusted by the TV. For temporary
trusted-LAN HTTP only, set `ALLOW_LAN_HTTP=true` and configure the matching HTTP
origin. HTTP exposes password/token traffic; do not expose it to the internet.

Startup validates credentials/origin/storage, opens or recovers playlist storage,
and then binds `0.0.0.0`. Invalid configuration or unreadable metadata fails startup.
`GET /api/health` reports listener availability, not disk durability. SIGTERM/SIGINT
stop accepting new work and drain active responses. Allow the stop grace period;
forced termination may interrupt a response. Sessions are held in memory: restart
logs the administrator out, while persisted images/playlist and the TV token remain.

To rotate the TV token, generate a new random token, replace the runtime environment
value and recreate the container; enter the replacement in the TV settings. Old
tokens stop working immediately, and the player retains its current in-memory
images until connectivity recovers. Change the administrator hash and restart to
rotate the password and invalidate all sessions. No credentials belong in URLs,
screenshots, committed configuration or diagnostic logs.

For a consistent backup, stop the single writer, copy the **entire** data volume
(metadata and image files) with a volume-aware backup tool, then restart. Keep
backups private and test restore into a separate empty volume before replacement.
Restore while stopped and preserve ownership. Never edit playlist JSON manually.
Atomic replacement and fsync reduce partial-write risk; a failure after metadata
publication can mean committed state with uncertain durability. Refresh the admin
after a storage error to learn authoritative state. Filesystem corruption, abrupt
power loss and physical-device durability have not been validated.

Troubleshooting: 401 means sign in again/check the TV token; 403 usually means the
browser Origin or CSRF token differs (reload after restart). 429 means login
throttling or two active uploads; retry later. 413 means body/file limit, 422 means
unsupported/corrupt/animated image or invalid order, 409 means playlist capacity.
For startup failure inspect configuration and data permissions without printing
secrets. For LAN failure check the server address, same Wi-Fi/VLAN, host firewall
TCP 3000, and HTTPS trust. Do not open a public router port for LAN testing.

References: [Compose env_file raw format](https://docs.docker.com/reference/compose-file/services/#format), [Bun server shutdown](https://bun.sh/docs/runtime/http/server).
