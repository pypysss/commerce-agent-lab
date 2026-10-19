import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['COMMERCE_WEB_PORT', 'COMMERCE_API_TARGET'])
  const port = Number(env.COMMERCE_WEB_PORT || 15173)
  const apiTarget = env.COMMERCE_API_TARGET || 'http://127.0.0.1:18080'
  return {
    plugins: [vue()],
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': apiTarget },
    },
    preview: { host: '127.0.0.1', port, strictPort: true },
  }
})
