import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

/**
 * GitHub Pages serves project sites from `/<repo>/`, so the build has to know
 * its base path. Locally (and for user sites) it stays at `/`.
 */
function resolveBase(): string {
  const explicit = process.env.BASE_PATH
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`
  if (process.env.GITHUB_ACTIONS !== 'true') return '/'
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
  if (!repo) return '/'
  return repo.endsWith('.github.io') ? '/' : `/${repo}/`
}

export default defineConfig({
  base: resolveBase(),
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
