// Prepara il sito da pubblicare: costruisce le quattro app e le mette insieme
// in dist/, il menù delle app alla radice e ciascuna app nella sua cartella.
//
//   npm run build          (dalla radice del progetto)
//
// È il comando che usa Netlify. Un solo sito, un solo indirizzo: chi entra dal
// menù è già dentro anche in tutte le app.

import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = join(dirname(fileURLToPath(import.meta.url)), '..');
const uscita = join(radice, 'dist');

/** [cartella dell'app, dove finisce dentro dist/] */
const APP = [
  ['portale', ''],
  ['comande', 'comande'],
  ['contabilita', 'contabilita'],
  ['utenti', 'utenti'],
];

rmSync(uscita, { recursive: true, force: true });
for (const [app, destinazione] of APP) {
  const cartella = join(radice, 'apps', app);
  console.log(`\n=== ${app} ===`);
  if (!existsSync(join(cartella, 'node_modules'))) execSync('npm ci', { cwd: cartella, stdio: 'inherit' });
  execSync('npm run build', { cwd: cartella, stdio: 'inherit' });
  cpSync(join(cartella, 'dist'), join(uscita, destinazione), { recursive: true });
}
console.log(`\nSito pronto in ${uscita}`);
