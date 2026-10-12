import { defineConfig } from 'vite'

export default defineConfig({
  base: '/witcher-marzena/',
  build: { chunkSizeWarningLimit: 4000, target: 'es2022' },
  server: { host: '127.0.0.1' },
})
