import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Separate config for component preview (no crx plugin)
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  root: 'dev',
  server: {
    port: 3001,
    open: true,
  },
});
