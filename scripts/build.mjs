import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

if (existsSync('./client/package.json')) {
  console.log('[Build] Detected repo root. Building client from root...');
  execSync('npm run build --prefix client', { stdio: 'inherit' });
} else if (existsSync('./package.json')) {
  console.log('[Build] Detected client folder. Building directly...');
  execSync('npx vite build', { stdio: 'inherit' });
} else {
  throw new Error('package.json not found');
}
