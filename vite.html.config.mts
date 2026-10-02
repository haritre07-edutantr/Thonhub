import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()], publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '.html-build', emptyOutDir: true, cssCodeSplit: false,
    lib: { entry: fileURLToPath(new URL('./html/main.tsx', import.meta.url)), name: 'ThonHub', formats: ['iife'], fileName: () => 'thonhub.js', cssFileName: 'thonhub' },
    rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); } },
  },
});
