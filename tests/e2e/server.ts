import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app";
import { openPlaylist } from "../../server/playlist";
const dataDir = await mkdtemp(join(tmpdir(), "signage-e2e-"));
const app = createApp({
  config: {
    port: 3187,
    dataDir,
    adminPasswordHash: await Bun.password.hash("test-password"),
    tvReadToken: crypto.randomUUID(),
    publicOrigin: "http://127.0.0.1:3187",
    allowLanHttp: true,
  },
  store: await openPlaylist(dataDir),
});
const server = Bun.serve({
  port: 3187,
  hostname: "127.0.0.1",
  fetch: app.fetch,
});
process.on("SIGTERM", async () => {
  server.stop(true);
  await rm(dataDir, { recursive: true, force: true });
  process.exit();
});
