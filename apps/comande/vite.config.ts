import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// I tipi condivisi vengono letti direttamente dal sorgente in shared/src:
// la cartella compilata shared/lib non è su GitHub, quindi la build di
// Netlify non potrebbe trovarla.
const shared = fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@sagra-mazzocco/shared': shared },
  },
  server: {
    fs: { allow: ['../..'] },
  },
})
