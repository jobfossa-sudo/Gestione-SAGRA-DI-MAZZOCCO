import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// I tipi condivisi vengono letti direttamente dal sorgente in shared/src:
// la cartella compilata shared/lib non è su GitHub, quindi una copia appena
// scaricata non potrebbe trovarla.
const shared = fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url))
const tema = fileURLToPath(new URL('../../shared/src/tema.ts', import.meta.url))
const carattere = fileURLToPath(new URL('../../shared/src/carattere.ts', import.meta.url))
const pwa = fileURLToPath(new URL('../../shared/src/pwa.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Percorsi relativi: pubblicata, ogni app vive nella sua cartella sotto lo
  // stesso indirizzo (/comande/), e così funziona ovunque la si metta.
  base: './',
  plugins: [
    // L'app installabile non è più solo Comande ma tutto il sito: la copia
    // per funzionare senza rete la prepara scripts/costruisci.mjs (/sw.js).
    react(),
  ],
  resolve: {
    // Il più specifico va per primo, altrimenti "…/shared" cattura anche
    // "…/shared/tema".
    alias: [
      { find: '@sagra-mazzocco/shared/carattere', replacement: carattere },
      { find: '@sagra-mazzocco/shared/tema', replacement: tema },
      { find: '@sagra-mazzocco/shared/pwa', replacement: pwa },
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
