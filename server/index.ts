import { createApp } from './app';
import { loadConfig } from './config';
import { openPlaylist } from './playlist';

const config = loadConfig();
const store = await openPlaylist(config.dataDir);
const app = createApp({ config, store });
Bun.serve({
  hostname: '0.0.0.0', port: config.port,
  maxRequestBodySize: 51 * 1024 * 1024,
  fetch(request, server) {
    return app.fetch(request, { clientAddress: server.requestIP(request)?.address });
  },
});
