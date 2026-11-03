// Un piccolo server per guardare sul computer il sito costruito, tutto sotto
// un solo indirizzo come su Firebase: serve per provare l'app installabile,
// che in sviluppo (npm run dev, un'app per porta) non c'è.
//
//   node scripts/servi.mjs [cartella]      (di solito dist-prova)
//
// Le regole sono quelle di Firebase Hosting in firebase.json: il browser
// ricontrolla sempre i file, e "/comande" diventa "/comande/".

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORTA = 5190;

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/** Accende il server sulla cartella e lo restituisce, già in ascolto. */
export function servi(cartella, porta = PORTA) {
  const base = resolve(cartella);
  const server = createServer(async (richiesta, risposta) => {
    const percorso = decodeURIComponent(new URL(richiesta.url, 'http://x').pathname);
    let file = normalize(join(base, percorso));
    if (!file.startsWith(base)) {
      risposta.writeHead(403).end();
      return;
    }
    try {
      const info = await stat(file);
      if (info.isDirectory()) {
        if (!percorso.endsWith('/')) {
          risposta.writeHead(301, { Location: `${percorso}/` }).end();
          return;
        }
        file = join(file, 'index.html');
      }
      const contenuto = await readFile(file);
      risposta.writeHead(200, {
        'Content-Type': TIPI[extname(file)] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      });
      risposta.end(contenuto);
    } catch {
      risposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
    }
  });
  return new Promise((pronto) => server.listen(porta, '127.0.0.1', () => pronto(server)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cartella = process.argv[2] ?? 'dist-prova';
  await servi(cartella);
  console.log(`Sito di ${cartella} su http://127.0.0.1:${PORTA}/  (Ctrl+C per spegnere)`);
}
