// Prova la schermata "Biglietti": blocchi da accendere, spegnere, trascinare,
// immagini e stampa di prova.
//
//   cd prove && npm install && node prova-biglietti.cjs
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

/** Un quadratino rosso di 8×8: basta per provare il caricamento. */
const PNG_DI_PROVA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAF0lEQVR42mP8z8DAwMDAxMDAwMDAAAAOEwGBBn1dbwAAAABJRU5ErkJggg==',
  'base64'
);

/** Aspetta che una condizione si avveri, invece di fidarsi di un'attesa fissa:
 * ogni modifica fa un giro fino al database e torna. */
async function attendi(descrizione, condizione, secondi = 12) {
  for (let i = 0; i < secondi * 2; i++) {
    if (await condizione()) return true;
    await new Promise((f) => setTimeout(f, 500));
  }
  console.log('   (attesa scaduta: ' + descrizione + ')');
  return false;
}

/** Trascina il primo blocco dell'elenco sopra quello indicato (che deve
 * essere visibile sullo schermo: si trascina col puntatore, come farebbe un
 * dito). */
async function trascina(pagina, suNome) {
  const maniglia = pagina.locator('.riga-blocco').first().locator('.maniglia');
  const bersaglio = pagina.locator('.riga-blocco', { hasText: suNome }).first();
  // hover() aspetta che la riga stia ferma: l'elenco si sposta di qualche
  // pixel ogni volta che arriva un aggiornamento dal database.
  await maniglia.hover();
  await pagina.mouse.down();
  const arrivo = await bersaglio.boundingBox();
  // Qualche passo: il puntatore deve passare sopra il bersaglio.
  await pagina.mouse.move(arrivo.x + 20, arrivo.y + 4, { steps: 12 });
  await pagina.mouse.move(arrivo.x + 20, arrivo.y + 2, { steps: 4 });
  await pagina.mouse.up();
  await pagina.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch();
  const pagina = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await pagina.addInitScript(() => {
    window.__stampe = [];
    window.print = () => {
      const area = document.querySelector('.area-stampa');
      window.__stampe.push(area ? area.innerHTML : '(vuota)');
    };
  });
  pagina.on('pageerror', (e) => console.log('ERRORE PAGINA:', e.message));
  pagina.on('dialog', (d) => d.accept());

  await pagina.goto(URL);
  await pagina.getByLabel('Nome utente').fill('admin');
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2500);
  await pagina.getByRole('button', { name: 'Biglietti' }).click();
  await pagina.waitForTimeout(1500);

  // Si parte dalla disposizione iniziale.
  await pagina.getByRole('button', { name: "Ripristina come all'inizio" }).click();
  await pagina.waitForTimeout(1500);

  verifica('la schermata elenca i blocchi del biglietto', (await pagina.locator('.riga-blocco').count()) >= 8);
  const anteprima = () => pagina.innerText('.cornice-anteprima');
  verifica(
    'l’anteprima mostra un ordine di esempio',
    await attendi('anteprima pronta', async () => /A0001/.test(await anteprima()) && /tavolo 12/i.test(await anteprima()))
  );
  verifica(
    'la carta di partenza è A5 orizzontale',
    (await pagina.getByLabel('Carta').inputValue()) === 'a5-orizzontale'
  );

  // I blocchi che tengono in piedi il sistema non si spengono.
  const spuntaTotale = pagina.locator('.riga-blocco', { hasText: 'Totale' }).first().locator('input[type=checkbox]').first();
  verifica('il Totale non si può spegnere sul resoconto', await spuntaTotale.isDisabled());

  // Spegnere un blocco lo toglie dal foglio.
  // Si usa il clic e non check()/uncheck(): la riga viene ridisegnata appena
  // la modifica è salvata, e le due funzioni di Playwright se ne lamentano.
  const spuntaTavolo = () =>
    pagina.locator('.riga-blocco', { hasText: 'Tavolo e coperti' }).first().locator('input[type=checkbox]').first();
  await spuntaTavolo().click();
  verifica(
    'spegnendo "Tavolo e coperti" il foglio non lo mostra più',
    await attendi('tavolo via dal foglio', async () => !/tavolo 12/i.test(await anteprima()))
  );
  await spuntaTavolo().click();
  verifica(
    'riaccendendolo torna',
    await attendi('tavolo di nuovo nel foglio', async () => /tavolo 12/i.test(await anteprima()))
  );

  // Un blocco nuovo, con il suo testo.
  await pagina.locator('.aggiungi-blocco select').selectOption('testo');
  await pagina.waitForTimeout(1200);
  const rigaTesto = pagina.locator('.riga-blocco', { hasText: 'Testo libero' }).last();
  await rigaTesto.locator('input[type=text]').fill('Grazie di essere venuti');
  await rigaTesto.locator('input[type=text]').blur();
  verifica(
    'un blocco di testo nuovo compare nel foglio',
    await attendi('testo nuovo nel foglio', async () => /Grazie di essere venuti/.test(await anteprima()))
  );

  // Trascinamento: il primo blocco scende sotto l'elenco dei piatti.
  const primoPrima = await pagina.locator('.riga-blocco .nome-blocco').first().innerText();
  await trascina(pagina, 'Elenco dei piatti');
  const spostato = await attendi(
    'primo blocco spostato',
    async () => (await pagina.locator('.riga-blocco .nome-blocco').first().innerText()) !== primoPrima
  );
  const primoDopo = await pagina.locator('.riga-blocco .nome-blocco').first().innerText();
  verifica('trascinando, i blocchi cambiano ordine', spostato, `prima ${primoPrima}, dopo ${primoDopo}`);

  // La carta si cambia e resta.
  await pagina.getByLabel('Carta').selectOption('a4-orizzontale');
  await pagina.waitForTimeout(1200);
  await pagina.reload();
  await pagina.waitForTimeout(3000);
  await pagina.getByRole('button', { name: 'Biglietti' }).click();
  await pagina.waitForTimeout(1500);
  verifica(
    'la carta scelta resta anche riaprendo la pagina',
    (await pagina.getByLabel('Carta').inputValue()) === 'a4-orizzontale'
  );
  await pagina.getByLabel('Carta').selectOption('a5-orizzontale');
  await pagina.waitForTimeout(1000);

  // Immagini: caricamento e uso in un blocco.
  await pagina.locator('.galleria-immagini input[type=file]').setInputFiles({
    name: 'logo-di-prova.png',
    mimeType: 'image/png',
    buffer: PNG_DI_PROVA,
  });
  verifica(
    'l’immagine caricata compare nella galleria',
    await attendi('immagine in galleria', async () => (await pagina.locator('.elenco-immagini li').count()) > 0)
  );

  await pagina.locator('.aggiungi-blocco select').selectOption('immagine');
  await pagina.waitForTimeout(1200);
  const rigaImmagine = pagina.locator('.riga-blocco', { hasText: 'Immagine' }).last();
  // Nella riga ci sono più tendine (posizione, allineamento): serve quella
  // dell'immagine.
  await rigaImmagine
    .locator('.impostazioni-blocco label', { hasText: 'Immagine' })
    .locator('select')
    .selectOption({ label: 'logo-di-prova' });
  verifica(
    'l’immagine scelta finisce nel foglio',
    await attendi('immagine nel foglio', async () => (await pagina.locator('.cornice-anteprima img').count()) === 1)
  );

  // Stampa di prova: esce quello che si vede.
  await pagina.getByRole('button', { name: 'Stampa una prova' }).click();
  await pagina.waitForTimeout(2000);
  const stampe = await pagina.evaluate(() => window.__stampe);
  const foglio = stampe[stampe.length - 1] || '';
  verifica('la stampa di prova esce col testo aggiunto', /Grazie di essere venuti/.test(foglio));
  verifica('…e con l’immagine', /<img/.test(foglio));
  verifica('…e col codice a barre', /codice-a-barre[\s\S]*<rect/.test(foglio));
  require('node:fs').writeFileSync(RISULTATI + '/foglio-biglietto.html', foglio);
  await pagina.screenshot({ path: RISULTATI + '/biglietti.png', fullPage: true });

  // La copia cucina ha i suoi blocchi obbligatori.
  await pagina.getByRole('button', { name: 'Copia cucina' }).click();
  await pagina.waitForTimeout(1500);
  const spuntaCodice = pagina.locator('.riga-blocco', { hasText: 'Numero di comanda' }).first().locator('input[type=checkbox]').first();
  const spuntaBarre = pagina.locator('.riga-blocco', { hasText: 'Codice a barre' }).first().locator('input[type=checkbox]').first();
  verifica('sulla copia cucina numero e codice a barre non si spengono', (await spuntaCodice.isDisabled()) && (await spuntaBarre.isDisabled()));
  verifica('la copia cucina non mostra prezzi', !/€/.test(await anteprima()));

  // Si rimette tutto come all'inizio e si toglie l'immagine di prova.
  await pagina.getByRole('button', { name: "Ripristina come all'inizio" }).click();
  await pagina.waitForTimeout(1200);
  await pagina.getByRole('button', { name: 'Resoconto per il cliente' }).click();
  await pagina.waitForTimeout(1000);
  await pagina.getByRole('button', { name: "Ripristina come all'inizio" }).click();
  await pagina.waitForTimeout(1500);
  verifica('il ripristino riporta la disposizione iniziale', !/Grazie di essere venuti/.test(await anteprima()));
  // Le prove interrotte possono aver lasciato più copie dell'immagine.
  for (let i = 0; i < 5; i++) {
    const elimina = pagina.getByRole('button', { name: 'Elimina logo-di-prova' }).first();
    if ((await elimina.count()) === 0) break;
    await elimina.click();
    await pagina.waitForTimeout(1200);
  }
  verifica(
    'l’immagine di prova si elimina',
    await attendi('galleria vuota', async () => (await pagina.locator('.elenco-immagini li').count()) === 0)
  );

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
