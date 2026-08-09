import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site at /<repo-name>/
  base: '/catflow-web/',
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'CatFlow',
        short_name: 'CatFlow',
        description: 'Log transactions to a Google Sheet',
        theme_color: '#2563eb',
        background_color: '#111318',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the app shell; API calls go to script.google.com and
        // are never cached (offline entries use the IndexedDB queue).
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: '/catflow-web/index.html',
      },
    }),
  ],
})
