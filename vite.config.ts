import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // Spotify rejects "localhost" as a redirect URI, so serve on the loopback IP instead.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
