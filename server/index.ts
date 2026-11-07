import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp({ config });
Bun.serve({
  hostname: '0.0.0.0', port: config.port,
  fetch(request, server) {
    return app.fetch(request, { clientAddress: server.requestIP(request)?.address });
  },
});
