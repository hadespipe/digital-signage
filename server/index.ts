import { createApp } from './app';
import { loadConfig } from './config';
import { openPlaylist } from './playlist';

const config = loadConfig();
const store = await openPlaylist(config.dataDir);
const app = createApp({ config, store });
const server = Bun.serve({
  hostname: '0.0.0.0', port: config.port,
  maxRequestBodySize: 51 * 1024 * 1024,
  fetch(request, server) {
    return app.fetch(request, { clientAddress: server.requestIP(request)?.address });
  },
});

// Drain active responses before exiting; sessions intentionally live only in memory.
let stopping = false;
const shutdown = async () => {
  if (stopping) return;
  stopping = true;
  await server.stop();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
