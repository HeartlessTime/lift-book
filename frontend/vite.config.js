import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = process.env.API_TARGET || 'http://127.0.0.1:3000'
const media = process.env.MEDIA_TARGET || 'http://127.0.0.1:8888'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/img': { target: media, changeOrigin: true },
      '/gif': { target: media, changeOrigin: true }
    }
  },
  build: { chunkSizeWarningLimit: 1500 },
  // The suite asserts on same-origin API paths, the way a browser build calls them. A developer
  // who has filled in .env.local for the native build (VITE_API_BASE points at the server, and
  // every request grows an absolute URL and a Bearer header) would otherwise see nine sync tests
  // fail for a reason that has nothing to do with their change. Pin the env the tests run under.
  test: { env: { VITE_API_BASE: '', VITE_DEVICE_TOKEN: '' } }
})
