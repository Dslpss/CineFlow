import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/stream-proxy': {
        target: 'http://tiralit.shop:8880',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/stream-proxy/, ''),
        secure: false,
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18', // Mimic VLC player
          'Referer': '', // Explicitly remove browser headers to avoid blocking
          'Origin': ''
        },
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            // Force CORS on the response
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
          });
        },
        followRedirects: true // Important: Follow redirects internally so the browser doesn't get redirected to a non-CORS server
      },
    },
  },
})
