import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function git(command: string): string {
  try {
    return execSync(`git ${command}`, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  define: {
    __APP_GIT_COMMIT__: JSON.stringify(git('rev-parse HEAD')),
    __APP_GIT_COMMIT_SHORT__: JSON.stringify(git('rev-parse --short HEAD')),
    __APP_GIT_COMMIT_DATE__: JSON.stringify(git('log -1 --format=%cI')),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@shelf-analysis/shared': new URL('../shared/src/types.ts', import.meta.url).href,
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
