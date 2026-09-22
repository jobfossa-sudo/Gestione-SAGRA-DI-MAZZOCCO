// Prova che l'app resti leggibile quando la rete cade e avvisi chi la usa.
//
//   cd prove && npm install && node prova-offline.cjs
//
// Serve il sistema di prova acceso (Avvia in locale.bat).

const { chromium } = require('playwright');
const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const URL = 'http://127.0.0.1:5173/';
const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const contesto = await browser.newContext();
  const pagina = await contesto.newPage();
  pagina.on('pageerror', (e) => console.log('ERRORE PAGINA:', e.message));

  await pagina.goto(URL);
  await pagina.getByLabel('Nome utente').fill('cassa');
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(3000);
  verifica('con la rete il menù si vede', /Pasta al ragù/.test(await pagina.innerText('.nuovo-ordine')));

  // Cade la rete.
  await contesto.setOffline(true);
  await pagina.waitForTimeout(2000);
  verifica('senza rete compare l’avviso', await pagina.locator('.avviso-rete').isVisible());
  verifica('il menù resta leggibile', /Pasta al ragù/.test(await pagina.innerText('.nuovo-ordine')));

  // Riaprire la pagina senza rete funziona solo nell'app pubblicata, dove
  // il browser se la tiene installata: in sviluppo quella parte è spenta
  // apposta, per non mandare in confusione le prove.

  // Senza rete l'ordine non può partire: il messaggio lo dice.
  await pagina.getByRole('button', { name: 'Aggiungi Pasta al ragù' }).click();
  await pagina.getByLabel('Tavolo').fill('5');
  await pagina.getByLabel('Coperti').fill('2');
  await pagina.getByRole('button', { name: 'Conferma ordine' }).click();
  await pagina.waitForTimeout(6000);
  const errore = await pagina.innerText('.piede-comanda');
  verifica('l’ordine non parte e lo dice in chiaro', /collegamento/i.test(errore), errore.split('\n').slice(-2).join(' '));
  await pagina.screenshot({ path: RISULTATI + '/senza-rete.png', fullPage: true });

  // Torna la rete.
  await contesto.setOffline(false);
  await pagina.waitForTimeout(3000);
  verifica('tornata la rete l’avviso sparisce', !(await pagina.locator('.avviso-rete').isVisible()));

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
