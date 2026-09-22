import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// I tipi condivisi vengono letti direttamente dal sorgente in shared/src:
// la cartella compilata shared/lib non è su GitHub, quindi la build di
// Netlify non potrebbe trovarla.
const shared = fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url))
const tema = fileURLToPath(new URL('../../shared/src/tema.ts', import.meta.url))
const carattere = fileURLToPath(new URL('../../shared/src/carattere.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // L'app si installa sul dispositivo: se la rete della sagra cade, la
    // pagina si riapre comunque (con i dati dell'ultimo aggiornamento) invece
    // di non aprirsi affatto. La versione nuova si aggiorna da sola appena
    // torna il collegamento.
    VitePWA({
      registerType: 'autoUpdate',
      // In sviluppo non serve: complicherebbe le prove senza dare niente.
      devOptions: { enabled: false },
      manifest: {
        name: 'Comande · Sagra di Mazzocco',
        short_name: 'Comande',
        description: 'Ordini, reparti e distribuzione della Sagra di Mazzocco',
        lang: 'it',
        start_url: '.',
        display: 'standalone',
        background_color: '#f7f3ec',
        theme_color: '#c2410c',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Le chiamate a Firebase non si mettono in cache: i dati aggiornati
        // arrivano da Firestore, che ha la sua copia locale.
        navigateFallbackDenylist: [/^\/__/],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    // Il più specifico va per primo, altrimenti "…/shared" cattura anche
    // "…/shared/tema".
    alias: [
      { find: '@sagra-mazzocco/shared/carattere', replacement: carattere },
      { find: '@sagra-mazzocco/shared/tema', replacement: tema },
      { find: '@sagra-mazzocco/shared', replacement: shared },
    ],
  },
  server: {
    // Indirizzo e porta fissi: l'app risponde sia a localhost sia a
    // 127.0.0.1, e se la porta è occupata si ferma invece di spostarsi sulla
    // 5174, che è quella dell'app Utenti.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: ['../..'] },
  },
})
