import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    // pdf.worker is loaded via ?url, no need to pre-bundle it
    exclude: ['pdfjs-dist'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
