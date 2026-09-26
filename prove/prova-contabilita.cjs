// L'app della contabilità: il cruscotto della serata, la chiusura dei
// cassetti, le spese, le entrate extra, le presenze e il report.
//
//   cd prove && node prova-contabilita.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat").

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');

const COMANDE = 'http://127.0.0.1:5173/';
const CONTABILITA = 'http://127.0.0.1:5175/';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

async function attendi(condizione, tentativi = 40, pausa = 500) {
  for (let i = 0; i < tentativi; i++) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return false;
}

/** Gli importi si leggono dalla pagina come numeri: "1.234,50 €" -> 1234.5 */
const cifra = (testo) => Number(String(testo ?? '0').replace(/[^\d,]/g, '').replace(',', '.'));

async function entra(browser, indirizzo, utente) {
  const pagina = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  await pagina.addInitScript(() => {
    window.__stampe = 0;
    window.print = () => (window.__stampe += 1);
  });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  pagina.on('console', (m) => {
    if (m.type() === 'error' && /permission-denied/.test(m.text())) {
      console.log(`[${utente}] PERMESSO NEGATO:`, m.text().slice(0, 120));
    }
  });
  await pagina.goto(indirizzo);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(3000);
  return pagina;
}

(async () => {
  const browser = await chromium.launch();

  // --- Chi può entrare ------------------------------------------------------
  const estraneo = await entra(browser, CONTABILITA, 'cassa');
  verifica(
    'chi non è contabile non entra nei conti',
    /Nessun accesso/i.test(await estraneo.innerText('body'))
  );
  await estraneo.close();

  const conti = await entra(browser, CONTABILITA, 'contabile');
  verifica('il contabile entra', /Contabilità/.test(await conti.innerText('header')));
  const schede = await conti.locator('.schede button').allInnerTexts();
  verifica(
    'ci sono le sei schede',
    schede.length === 6 && /Serata/.test(schede[0]) && /Report/.test(schede[5]),
    schede.join(' | ')
  );

  // --- Il cruscotto legge quello che ha fatto Comande -----------------------
  verifica(
    'il cruscotto mostra l’incasso della serata',
    await attendi(async () => cifra(await conti.locator('.quadrato-incasso-totale .valore-quadrato').innerText()) > 0),
    await conti.locator('.quadrato-incasso-totale .valore-quadrato').innerText()
  );
  const incassoPrima = cifra(await conti.locator('.quadrato-incasso-totale .valore-quadrato').innerText());
  verifica('e il dettaglio cassetto per cassetto', (await conti.locator('.cruscotto .tabella-conti tbody tr').count()) > 0);
  await conti.screenshot({ path: RISULTATI + '/contabilita-serata.png', fullPage: true });

  // Un ordine battuto adesso in Comande deve comparire qui da solo.
  const cassa = await entra(browser, COMANDE, 'cassa');
  await cassa.getByLabel('Tavolo').fill('3');
  await cassa.getByLabel('Coperti').fill('2');
  await cassa.getByRole('button', { name: 'Aggiungi Patatine fritte' }).click();
  await cassa.getByRole('button', { name: 'POS' }).click();
  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  await cassa.waitForTimeout(4000);
  verifica(
    'un ordine battuto in cassa arriva nei conti da solo',
    await attendi(
      async () => cifra(await conti.locator('.quadrato-incasso-totale .valore-quadrato').innerText()) > incassoPrima
    ),
    `prima ${incassoPrima.toFixed(2)}`
  );
  verifica(
    'e finisce fra i pagamenti col POS',
    cifra(await conti.locator('.riga-quadrati .quadrato').nth(2).innerText()) > 0
  );

  // --- La chiusura dei cassetti --------------------------------------------
  await conti.getByRole('button', { name: 'Chiusura' }).click();
  await conti.waitForTimeout(1500);
  verifica('c’è un cassetto da contare per ogni punto vendita', (await conti.locator('.cassetto').count()) > 0);
  verifica(
    'e finché non si conta lo dice',
    /da contare/i.test(await conti.locator('.totale-scarto').innerText())
  );

  const cassetto = conti.locator('.cassetto').first();
  const attesoTesto = await cassetto.locator('.atteso').innerText();
  const attesoContanti = cifra(attesoTesto.split('·')[0]);
  await cassetto.getByLabel(/^Fondo cassa/).fill('100');
  await cassetto.getByLabel(/^Contanti contati/).fill(String(100 + attesoContanti).replace('.', ','));
  await cassetto.getByLabel(/^POS letto/).fill('0');
  await conti.locator('h2').first().click();
  verifica(
    'contando giusto la differenza è zero',
    await attendi(async () => /0,00/.test(await cassetto.locator('.scarto').first().innerText())),
    await cassetto.locator('.scarto').first().innerText()
  );
  verifica(
    'e si vede che torna',
    (await cassetto.locator('.scarto.giusto').count()) > 0
  );

  await cassetto.getByLabel(/^Contanti contati/).fill(String(100 + attesoContanti - 4).replace('.', ','));
  await conti.locator('h2').first().click();
  verifica(
    'togliendo 4 euro la differenza lo dice',
    await attendi(async () => /−4,00|-4,00/.test(await cassetto.locator('.scarto').first().innerText())),
    await cassetto.locator('.scarto').first().innerText()
  );
  verifica('e si vede che non torna', (await cassetto.locator('.scarto.storto').count()) > 0);
  await conti.screenshot({ path: RISULTATI + '/contabilita-chiusura.png', fullPage: true });

  // Il conteggio resta salvato anche ricaricando: è un dato, non uno schermo.
  await conti.reload();
  await conti.waitForTimeout(3000);
  await conti.getByRole('button', { name: 'Chiusura' }).click();
  await conti.waitForTimeout(2000);
  verifica(
    'il conteggio resta salvato',
    await attendi(async () => (await conti.locator('.cassetto').first().getByLabel(/^Fondo cassa/).inputValue()) === '100')
  );

  // --- Le spese -------------------------------------------------------------
  await conti.getByRole('button', { name: 'Uscite' }).click();
  await conti.waitForTimeout(1500);
  const spesa = 'Salsiccia ' + Date.now().toString().slice(-5);
  await conti.getByLabel('Cosa').fill(spesa);
  await conti.getByLabel('Importo').fill('250,50');
  await conti.getByRole('button', { name: 'Aggiungi spesa' }).click();
  verifica(
    'una spesa si aggiunge',
    await attendi(async () => (await conti.innerText('.movimenti')).includes(spesa))
  );
  verifica(
    'ed entra subito nel totale speso',
    cifra(await conti.locator('.quadrato-uscita .valore-quadrato').innerText()) >= 250.5
  );

  // Un preventivo non deve contare finché non è pagato.
  const preventivo = 'Tensostruttura ' + Date.now().toString().slice(-5);
  const spesoPrima = cifra(await conti.locator('.quadrato-uscita .valore-quadrato').innerText());
  await conti.getByLabel('Cosa').fill(preventivo);
  await conti.getByLabel('Importo').fill('1000');
  await conti.getByLabel('Già pagata').uncheck();
  await conti.getByRole('button', { name: 'Aggiungi spesa' }).click();
  await conti.waitForTimeout(2500);
  verifica(
    'un preventivo non ancora pagato non conta nel totale',
    cifra(await conti.locator('.quadrato-uscita .valore-quadrato').innerText()) === spesoPrima,
    `speso ${spesoPrima.toFixed(2)}`
  );
  verifica(
    'ma si vede fra quelli da pagare',
    cifra(await conti.locator('.quadrato-conteggio .valore-quadrato').innerText()) >= 1000
  );
  await conti.screenshot({ path: RISULTATI + '/contabilita-uscite.png', fullPage: true });

  // --- Le entrate fuori cassa ----------------------------------------------
  await conti.getByRole('button', { name: 'Entrate extra' }).click();
  await conti.waitForTimeout(1500);
  const sponsor = 'Sponsor ' + Date.now().toString().slice(-5);
  await conti.getByLabel('Da dove').fill(sponsor);
  await conti.getByLabel('Importo').fill('300');
  await conti.getByRole('button', { name: 'Aggiungi entrata' }).click();
  verifica(
    'un’entrata fuori cassa si aggiunge',
    await attendi(async () => (await conti.innerText('.movimenti')).includes(sponsor))
  );
  verifica(
    'ed entra nel totale incassato fuori cassa',
    cifra(await conti.locator('.quadrato-incasso .valore-quadrato').innerText()) >= 300
  );

  // --- Le presenze ----------------------------------------------------------
  await conti.getByRole('button', { name: 'Presenze' }).click();
  await conti.waitForTimeout(1500);
  verifica('c’è un volontario per riga', (await conti.locator('.tabella-presenze tbody tr').count()) > 0);
  const primo = conti.locator('.tabella-presenze tbody tr').first();

  // Si riparte da zero: le presenze restano in archivio da un giro all'altro,
  // e trovando la riga già spuntata i conti qui sotto non tornerebbero.
  if (await primo.locator('input[type=checkbox]').nth(1).isChecked()) {
    await primo.locator('input[type=checkbox]').nth(1).click();
    await conti.waitForTimeout(1200);
  }
  if (await primo.locator('input[type=checkbox]').first().isChecked()) {
    await primo.locator('input[type=checkbox]').first().click();
    await conti.waitForTimeout(1200);
  }

  await primo.locator('input[type=checkbox]').first().check();
  verifica(
    'spuntare una presenza fa comparire la resa per volontario',
    await attendi(async () => cifra(await conti.locator('.quadrato-incasso .valore-quadrato').innerText()) > 0)
  );
  const resaIntera = cifra(await conti.locator('.quadrato-incasso .valore-quadrato').innerText());
  await primo.locator('input[type=checkbox]').nth(1).check();
  verifica(
    'mezza serata pesa la metà, quindi la resa raddoppia',
    await attendi(async () => {
      const ora = cifra(await conti.locator('.quadrato-incasso .valore-quadrato').innerText());
      return Math.abs(ora - resaIntera * 2) < 0.02;
    }),
    `intera ${resaIntera.toFixed(2)}`
  );
  await conti.screenshot({ path: RISULTATI + '/contabilita-presenze.png', fullPage: true });

  // --- Il report ------------------------------------------------------------
  await conti.getByRole('button', { name: 'Report' }).click();
  await conti.waitForTimeout(2500);
  const bilancio = await conti.innerText('.tabella-bilancio');
  verifica('il report ha il conto economico', /Totale entrate/.test(bilancio) && /Totale uscite/.test(bilancio));
  const entrateTotali = cifra((bilancio.match(/Totale entrate\s+([\d.,]+)/) || [])[1]);
  const usciteTotali = cifra((bilancio.match(/Totale uscite\s+−?\s*([\d.,]+)/) || [])[1]);
  const utile = cifra((bilancio.match(/(?:Avanzo|Perdita)\s+−?\s*([\d.,]+)/) || [])[1]);
  verifica(
    'entrate meno uscite fa il risultato',
    Math.abs(Math.abs(entrateTotali - usciteTotali) - utile) < 0.02,
    `${entrateTotali.toFixed(2)} − ${usciteTotali.toFixed(2)} = ${utile.toFixed(2)}`
  );
  verifica('c’è la tabella serata per serata', (await conti.locator('.report .tabella-conti').count()) >= 2);

  const foglio = await conti.innerText('.foglio-volontari');
  verifica('e il foglio per i volontari', /coperti serviti/.test(foglio) && /Grazie a tutti/.test(foglio));
  verifica('che di suo non mostra l’avanzo', !/Avanzo/.test(foglio));
  await conti.getByLabel('Mostra anche quanto è avanzato').check();
  await conti.waitForTimeout(500);
  verifica('ma lo può mostrare', /Avanzo/.test(await conti.innerText('.foglio-volontari')));

  await conti.getByRole('button', { name: 'Stampa il foglio' }).click();
  await conti.waitForTimeout(1000);
  verifica('il foglio si stampa', (await conti.evaluate(() => window.__stampe)) === 1);
  await conti.screenshot({ path: RISULTATI + '/contabilita-report.png', fullPage: true });

  await browser.close();

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
