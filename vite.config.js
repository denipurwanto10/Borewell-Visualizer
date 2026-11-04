import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pdf': ['jspdf'],
          'vendor-zip': ['jszip'],
          'vendor-icons': ['lucide-react'],
        },
        assetFileNames: (assetInfo) => {
          let extType = assetInfo.name.split('.').at(1) || 'asset'
          if (/png|jpe?g|gif|webp|svg|ico/.test(extType)) {
            extType = 'img'
          }
          if (/css/.test(extType)) {
            extType = 'css'
          }
          return `assets/${assetInfo.name}.${extType}`
        }
      }
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    open: true,
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        headers: {
          Origin: 'http://127.0.0.1:8080',
        },
        cookieDomainRewrite: {
          'localhost': 'localhost',
          '127.0.0.1': 'localhost',
        },
        configure: (proxy, _options) => {
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            // Forward Set-Cookie headers from backend to frontend
            const setCookie = proxyRes.headers['set-cookie'];
            if (setCookie) {
              console.log('[Vite Proxy] Forwarding Set-Cookie:', setCookie);
            }
          });
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Error:', err);
          });
        },
      },
    },
  }
})