import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwind from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: [
          '@auralith/core-ai',
          '@auralith/core-db',
          '@auralith/core-domain',
          '@auralith/core-events',
          '@auralith/core-ingest',
          '@auralith/core-news',
          '@auralith/core-retrieval',
          '@auralith/core-routines',
          '@auralith/core-scheduler',
          '@auralith/core-suggest',
          '@auralith/core-tools',
          '@auralith/core-voice',
          '@auralith/core-weather',
          '@auralith/design-system',
        ],
      }),
    ],
    resolve: {
      alias: {
        '@main': resolve(__dirname, 'src/main'),
      },
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          'workers/whisper/index': resolve(__dirname, 'src/workers/whisper/index.js'),
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js',
        },
        external: [
          'better-sqlite3',
          'drizzle-orm',
          'drizzle-orm/better-sqlite3',
          'sqlite-vec',
          'pdf-parse',
          'electron',
        ],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer'),
      },
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          mini: resolve(__dirname, 'src/renderer/mini.html'),
          spotlight: resolve(__dirname, 'src/renderer/spotlight.html'),
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwind({ config: resolve(__dirname, 'tailwind.config.ts') }), autoprefixer()],
      },
    },
  },
})
