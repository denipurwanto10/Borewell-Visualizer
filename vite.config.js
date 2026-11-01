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
    }
  },
  server: {
    open: true
  }
})