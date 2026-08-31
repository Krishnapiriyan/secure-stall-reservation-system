import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    https: true,
    proxy: {
      '/api': { target: 'https://localhost:8443', changeOrigin: true, secure: false },
      '/uploads': { target: 'https://localhost:8443', changeOrigin: true, secure: false },
      '/ws': { target: 'https://localhost:8443', ws: true, secure: false }
    }
  }
})
