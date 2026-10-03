import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/static/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      scope: '/',
      includeAssets: ['magavi-mark.svg'],
      workbox: {
        // Django owns these routes. Never satisfy their navigations with the SPA shell.
        navigateFallbackDenylist: [/^\/admin(?:\/|$)/, /^\/api(?:\/|$)/, /^\/static(?:\/|$)/],
      },
      manifest: {
        name: 'MAGAVI Inteligencia Comercial',
        short_name: 'MAGAVI',
        description: 'Inteligencia comercial territorial para oportunidades B2B.',
        theme_color: '#091b2a',
        background_color: '#f4f7f5',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/static/magavi-mark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    css: true,
  },
})
