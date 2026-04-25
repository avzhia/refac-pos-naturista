import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BACKEND_URL || 'http://localhost:8001'

  return {
    plugins: [
      tailwindcss(),
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        manifest: {
          name: 'TiendaNaturistaMX POS',
          short_name: 'Naturista POS',
          theme_color: '#15803d',
          background_color: '#f0fdf4',
          display: 'standalone',
          icons: [{ src: '/logo.png', sizes: '192x192', type: 'image/png' }],
        },
      }),
    ],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  }
})
