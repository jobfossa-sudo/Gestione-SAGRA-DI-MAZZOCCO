// Prepara il sito da pubblicare: costruisce le quattro app e le mette insieme
// in dist/, il menù delle app alla radice e ciascuna app nella sua cartella,
// poi aggiunge /sw.js, la copia che fa dell'intero sito un'app installabile
// che si apre anche senza rete.
//
//   npm run build          (dalla radice del progetto)
//   npm run build:prova    la stessa cosa in dist-prova/, ma collegata agli
//                          emulatori: per provare l'app installata sul computer
//                          senza toccare i dati veri (npm run prova:app)
//
// `firebase deploy` lo lancia da solo prima di pubblicare (vedi firebase.json).
// Un solo sito, un solo indirizzo: chi entra dal menù è già dentro anche in
// tutte le app.

import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const prova = process.argv.includes('--prova');
const uscita = join(radice, prova ? 'dist-prova' : 'dist');

/** [cartella dell'app, dove finisce dentro dist/] */
const APP = [
  ['portale', ''],
  ['comande', 'comande'],
  ['contabilita', 'contabilita'],
  ['utenti', 'utenti'],
  ['tombola', 'tombola'],
];

if (!existsSync(join(radice, 'node_modules'))) execSync('npm ci', { cwd: radice, stdio: 'inherit' });
const { generateSW } = await import('workbox-build');

// Detto a ogni app in modo esplicito, così una variabile rimasta nel terminale
// non può far finire sul sito vero una versione che parla con gli emulatori.
const ambiente = { ...process.env, VITE_EMULATORI: prova ? '1' : '0' };

rmSync(uscita, { recursive: true, force: true });
for (const [app, destinazione] of APP) {
  const cartella = join(radice, 'apps', app);
  console.log(`\n=== ${app} ===`);
  if (!existsSync(join(cartella, 'node_modules'))) execSync('npm ci', { cwd: cartella, stdio: 'inherit' });
  execSync('npm run build', { cwd: cartella, stdio: 'inherit', env: ambiente });
  cpSync(join(cartella, 'dist'), join(uscita, destinazione), { recursive: true });
}

// La copia del sito nel dispositivo. Una sola per tutte le app: chi ha aperto
// il menù una volta ritrova anche Comande e Contabilità quando la rete cade.
const { count, size, warnings } = await generateSW({
  globDirectory: uscita,
  globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
  globIgnores: [
    // la copia stessa e i suoi pezzi
    'sw.js',
    'workbox-*.js',
    // quella vecchia di Comande, che c'è solo per cancellarsi da sola
    'comande/sw.js',
    // la libreria dell'Excel dell'archivio: quasi un mega, la usa solo
    // l'amministratore quando salva un'edizione, e arriva dalla rete quando serve
    '**/exceljs*.js',
    '**/jszip*.js',
  ],
  swDest: join(uscita, 'sw.js'),
  // "/comande/?menu" è la stessa pagina di "/comande/": i file con il codice
  // hanno già la versione nel nome, quindi nessun parametro conta.
  ignoreURLParametersMatching: [/./],
  directoryIndex: 'index.html',
  // La versione nuova non parte da sola: aspetta il tasto "Aggiorna"
  // (shared/src/pwa.ts), per non ricaricare la cassa a metà di un ordine.
  skipWaiting: false,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  mode: 'production',
  sourcemap: false,
});
for (const avviso of warnings) console.warn(avviso);
console.log(`\nCopia senza rete: ${count} file, ${(size / 1024 / 1024).toFixed(1)} MB`);
console.log(`Sito pronto in ${uscita}${prova ? ' (versione di prova, collegata agli emulatori)' : ''}`);
