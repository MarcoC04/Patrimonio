import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

/**
 * CSP rigida, applicata solo alla build: in sviluppo Vite/React iniettano script inline
 * (HMR) che una CSP senza 'unsafe-inline' bloccherebbe.
 * Rete: solo lo script Apps Script (script.google.com e il suo redirect su googleusercontent.com).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self' https://script.google.com https://script.googleusercontent.com",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

// base relativa: l'app può stare in una sottocartella (GitHub Pages: /<repo>/).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'inject-csp',
      apply: 'build',
      transformIndexHtml: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
    VitePWA({
      registerType: 'autoUpdate',
      // La registrazione la fa src/app/updates.ts (ricarica la pagina quando c'è una versione nuova).
      injectRegister: false,
      manifest: {
        name: 'Patrimonio',
        short_name: 'Patrimonio',
        lang: 'it',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#ffffff',
        theme_color: '#0f766e',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    // Di norma Vitest svuota i CSS; index.css serve intero al test che confronta la palette.
    css: { include: [/index\.css/] },
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
