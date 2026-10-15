import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const COMPRESSIBLE = /\.(?:js|css|html|svg|webmanifest|json)$/
const MIN_COMPRESS_BYTES = 1024

/** Writes `.br` and `.gz` next to every text asset; the server picks one by `Accept-Encoding`. */
function precompress(): Plugin {
  let outDir = 'dist'
  return {
    name: 'erp-precompress',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle: {
      order: 'post',
      handler() {
        const walk = (dir: string): string[] =>
          readdirSync(dir).flatMap((name) => {
            const full = path.join(dir, name)
            return statSync(full).isDirectory() ? walk(full) : [full]
          })
        for (const file of walk(outDir)) {
          if (!COMPRESSIBLE.test(file)) continue
          const data = readFileSync(file)
          if (data.length < MIN_COMPRESS_BYTES) continue
          writeFileSync(`${file}.br`, brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }))
          writeFileSync(`${file}.gz`, gzipSync(data, { level: 9 }))
        }
      },
    },
  }
}

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4568'
const apiProxy = {
  '/api': { target: apiTarget, changeOrigin: true },
  '/health': { target: apiTarget, changeOrigin: true },
}

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'fonts/*.woff2'],
      manifest: {
        name: 'ERP АММИР',
        short_name: 'АММИР',
        description: 'Внутренняя ERP-система компании АММИР',
        theme_color: '#242d3d',
        background_color: '#eef0f3',
        display: 'standalone',
        lang: 'ru',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
      },
    }),
    precompress(),
  ],
  build: {
    target: 'baseline-widely-available',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 4567,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 4567,
    strictPort: true,
    proxy: apiProxy,
  },
})
