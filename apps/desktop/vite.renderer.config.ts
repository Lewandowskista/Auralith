import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'renderer'),
  base: './',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'renderer'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'renderer/index.html'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
