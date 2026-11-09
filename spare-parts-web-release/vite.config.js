import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { inlineBuildStyles } from './tools/inline-build-styles.mjs'
import {pdfAssets} from './tools/pdf-assets.mjs'
import {abbModelAssets} from './tools/abb-model-assets.mjs'
import {abbProgramWorker} from './tools/abb-program-worker.mjs'

export default defineConfig({
  plugins: [vue(), inlineBuildStyles(),pdfAssets(),abbModelAssets(),abbProgramWorker()],
  server: {
    host: '127.0.0.1',
    port: 8502,
    proxy: {
      '/models': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    target: 'chrome80',
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        assetFileNames:asset=>(asset.names?.[0]||asset.name||'').endsWith('.mjs')?'assets/[name]-[hash].js':'assets/[name]-[hash][extname]',
        manualChunks: {
          vue: ['vue', 'vue-router'],
          element: ['element-plus', '@element-plus/icons-vue'],
          three: ['three'],
          charts: ['echarts'],
          network: ['axios']
        }
      }
    }
  }
})
