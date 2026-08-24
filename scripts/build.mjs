import { build } from 'vite';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const clientRoot = existsSync('./client') ? resolve(process.cwd(), 'client') : process.cwd();
const outDir = existsSync('./client') ? resolve(process.cwd(), 'client/dist') : resolve(process.cwd(), 'dist');

console.log(`[Build] Building Vite client using Node JS API (root: ${clientRoot})...`);

await build({
  root: clientRoot,
  build: {
    outDir,
    emptyOutDir: true,
  },
});

console.log('[Build] ✓ Vite build completed successfully!');
