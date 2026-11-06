import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
    },
    // Deduplicate magic-sdk to prevent version conflicts
    dedupe: ['magic-sdk', '@magic-sdk/admin'],
  },
  optimizeDeps: {
    // Force Vite to pre-bundle magic-sdk
    include: ['magic-sdk'],
    esbuildOptions: {
      // Ensure magic-sdk is bundled correctly
      target: 'es2020',
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to Express server during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  root: '.',
  publicDir: path.resolve(__dirname, 'public'),
  base: '/',
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('remotion') || id.includes('@remotion')) return 'remotion';
            if (id.includes('react') || id.includes('react-dom')) return 'react';
            if (id.includes('gsap')) return 'gsap';
            if (id.includes('lottie')) return 'lottie';
            return 'vendor';
          }
        },
      },
    },
  },
})
