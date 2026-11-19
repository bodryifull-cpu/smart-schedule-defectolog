/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import type { ProxyOptions } from 'vite'

/** Убирает браузерные Origin/Referer из проксируемых запросов (WAF иначе даёт 403). */
function stripOriginHeaders(proxy: Parameters<NonNullable<ProxyOptions['configure']>>[0]): void {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.removeHeader('origin')
    proxyReq.removeHeader('referer')
  })
}

export default defineConfig({
  // Относительные пути — чтобы сборка работала и по file:// в Electron.
  base: './',
  server: {
    // Явный IPv4: часть окружений разрешает localhost в ::1, и браузер
    // тогда не достаёт сервер («страница не найдена»).
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // В dev-режиме запросы к GigaChat идут через прокси (обход CORS
      // и ГОСТ-сертификатов на уровне dev-сервера). Origin/Referer браузера
      // срезаем — WAF GigaChat отвечает 403 на чужой Origin.
      // ВАЖНО: более длинные префиксы идут ПЕРВЫМИ и с якорем '^' — иначе
      // '/giga' перехватывает '/giga-ngw'/'/giga-old', путь искажается
      // ('-ngw/api/v2/oauth') и nginx отвечает 403 Forbidden.
      '^/giga-ngw': {
        target: 'https://ngw.devices.sberbank.ru:9443',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/giga-ngw/, ''),
        configure: stripOriginHeaders
      },
      '^/giga-old': {
        target: 'https://gigachat.devices.sberbank.ru',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/giga-old/, ''),
        configure: stripOriginHeaders
      },
      '^/giga': {
        target: 'https://api.giga.chat',
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/giga/, ''),
        configure: stripOriginHeaders
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Умное расписание дефектолога',
        short_name: 'Расписание',
        description: 'Умное расписание дефектолога: расписание + КТП в одном календаре',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        lang: 'ru',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}']
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
