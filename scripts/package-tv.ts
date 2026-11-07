import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const cli = 'node_modules/@webos-tools/cli/bin/ares-package.js';
if (!existsSync(cli)) throw new Error('Official webOS CLI missing. Run bun install first.');
mkdirSync('dist/tv', { recursive: true });
const result = spawnSync('node', [cli, 'tv', '--outdir', 'dist/tv', '--no-minify'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
