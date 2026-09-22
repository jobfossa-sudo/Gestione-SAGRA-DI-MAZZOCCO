import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// I tipi condivisi vengono letti direttamente dal sorgente in shared/src:
// la cartella compilata shared/lib non è su GitHub, quindi la build di
// Netlify non potrebbe trovarla.
const shared = fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url))
const tema = fileURLToPath(new URL('../../shared/src/tema.ts', import.meta.url))
const carattere = fileURLToPath(new URL('../../shared/src/carattere.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    // Porta diversa da Comande, così le due app girano insieme in locale.
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: { allow: ['../..'] },
  },
})
