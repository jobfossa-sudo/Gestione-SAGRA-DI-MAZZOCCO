// Prova i tasti per rimpicciolire e ingrandire le scritte.
//
//   cd prove && npm install && node prova-carattere.cjs
//
// Serve il sistema di prova acceso (Avvia in locale.bat).

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium, devices } = require('playwright');

const COMANDE = 'http://127.0.0.1:5173/';
const UTENTI = 'http://127.0.0.1:5174/';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

/** La misura che vale davvero per la pagina: è quella a cui sono agganciate
 * tutte le altre, perché i fogli di stile misurano in rem. */
const misuraPagina = (pagina) =>
  pagina.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

/** Vero se la pagina è costretta a scorrere di lato: vuol dire che qualcosa
 * non ci sta più. */
const sborda = (pagina) =>
  pagina.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

async function entra(browser, utente) {
  const pagina = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  await pagina.goto(COMANDE);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(3000);
  return pagina;
}

(async () => {
  const browser = await chromium.launch();

  // --- Prima ancora di entrare ---------------------------------------------
  // Chi non riesce a leggere la schermata di accesso non può ingrandirla
  // dopo: il tasto dev'essere già lì.
  const accesso = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await accesso.goto(COMANDE);
  await accesso.waitForTimeout(1500);
  verifica(
    'il tasto c’è già sulla schermata di accesso',
    await accesso.getByRole('button', { name: 'Scritte più grandi' }).isVisible()
  );
  await accesso.close();

  const cassa = await entra(browser, 'cassa');
  const partenza = await misuraPagina(cassa);
  verifica('si parte dalla misura normale', partenza === 17, `${partenza}px`);

  const piuGrandi = cassa.getByRole('button', { name: 'Scritte più grandi' });
  const piuPiccole = cassa.getByRole('button', { name: 'Scritte più piccole' });
  const normale = cassa.getByRole('button', { name: 'Grandezza normale' });

  // --- Ingrandire ----------------------------------------------------------
  await piuGrandi.click();
  await cassa.waitForTimeout(500);
  const dopoUnTocco = await misuraPagina(cassa);
  verifica('un tocco ingrandisce le scritte', dopoUnTocco > partenza, `${partenza}px → ${dopoUnTocco}px`);
  verifica(
    'e si alza tutto insieme, non solo il testo',
    (await cassa.locator('.tasti-cassa button').first().evaluate((b) => b.getBoundingClientRect().height)) > 44,
    'altezza dei tasti'
  );

  await piuGrandi.click();
  await cassa.waitForTimeout(600);
  const massimo = await misuraPagina(cassa);
  verifica('due tocchi arrivano al massimo', massimo === 21, `${massimo}px`);
  verifica('al massimo il tasto si spegne', await piuGrandi.isDisabled());
  verifica('e la pagina non sborda di lato', !(await sborda(cassa)));
  verifica(
    'il menù non è costretto a scorrere di lato',
    !(await cassa.locator('.tabella-scroll').evaluate((t) => t.scrollWidth > t.clientWidth + 1))
  );
  const bancoGrande = await cassa.evaluate(() =>
    Math.round(document.querySelector('.colonna-comanda').getBoundingClientRect().width)
  );
  verifica('il banco si allarga insieme alle scritte', bancoGrande > 750, `${bancoGrande}px`);
  await cassa.screenshot({ path: RISULTATI + '/carattere-grande.png' });

  // --- Tornare a normale e rimpicciolire -----------------------------------
  await normale.click();
  await cassa.waitForTimeout(600);
  verifica('il tasto di mezzo riporta alla misura normale', (await misuraPagina(cassa)) === 17);

  await piuPiccole.click();
  await cassa.waitForTimeout(600);
  const piccolo = await misuraPagina(cassa);
  verifica('e si può anche rimpicciolire', piccolo === 15, `${piccolo}px`);
  verifica('al minimo il tasto si spegne', await piuPiccole.isDisabled());
  verifica('anche da piccolo la pagina non sborda', !(await sborda(cassa)));
  await cassa.screenshot({ path: RISULTATI + '/carattere-piccolo.png' });

  // --- La carta non si tocca -----------------------------------------------
  // Il biglietto esce dalla stampante sempre uguale: la grandezza scelta è una
  // preferenza di chi guarda lo schermo, non una misura del foglio. Il foglio
  // vero si vede nella scheda "Biglietti", che è dell'amministratore: alla
  // cassa il resoconto è ormai un riquadro dell'app, e quello sì che cresce
  // con le scritte.
  const admin = await entra(browser, 'admin');
  await admin.getByRole('button', { name: 'Biglietti' }).click();
  await admin.waitForTimeout(2000);
  const misuraFoglio = () =>
    admin.evaluate(() => {
      const f = document.querySelector('.cornice-anteprima .foglio-composto');
      return { larghezza: f.offsetWidth, corpo: getComputedStyle(f).fontSize };
    });
  const foglioNormale = await misuraFoglio();
  await admin.getByRole('button', { name: 'Scritte più grandi' }).click();
  await admin.getByRole('button', { name: 'Scritte più grandi' }).click();
  await admin.waitForTimeout(800);
  const foglioGrande = await misuraFoglio();
  verifica(
    'il biglietto da stampare resta della stessa misura',
    foglioNormale.larghezza === foglioGrande.larghezza && foglioNormale.corpo === foglioGrande.corpo,
    `${foglioNormale.larghezza}px / ${foglioNormale.corpo} contro ${foglioGrande.larghezza}px / ${foglioGrande.corpo}`
  );
  await admin.close();

  // --- La scelta resta -----------------------------------------------------
  await cassa.reload();
  await cassa.waitForTimeout(2500);
  verifica('riaprendo la pagina la scelta è ancora lì', (await misuraPagina(cassa)) === 15, 'dopo il ricaricamento');

  // Applicata prima del disegno: senza lo scriptino in index.html la pagina
  // comparirebbe normale e salterebbe alla misura scelta un attimo dopo.
  const appenaAperta = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await appenaAperta.addInitScript(() => {
    localStorage.setItem('carattere', '21');
  });
  await appenaAperta.goto(COMANDE, { waitUntil: 'commit' });
  await appenaAperta.waitForTimeout(400);
  verifica(
    'e si vede subito, senza che la pagina salti',
    (await misuraPagina(appenaAperta)) === 21,
    'misura già applicata al primo disegno'
  );
  await appenaAperta.close();

  // Si torna a normale: le altre prove partono da lì.
  await cassa.getByRole('button', { name: 'Grandezza normale' }).click();
  await cassa.waitForTimeout(600);
  verifica('rimessa a normale per chi viene dopo', (await misuraPagina(cassa)) === 17);
  await cassa.close();

  // --- Il cliente col telefono ---------------------------------------------
  const telefono = await browser.newContext(devices['iPhone 13']);
  const cliente = await telefono.newPage();
  await cliente.goto(COMANDE + '?menu');
  // Si aspetta che i piatti ci siano davvero: su una pagina ancora vuota il
  // controllo dello sbordamento passerebbe sempre, senza dimostrare niente.
  await cliente.getByText('Pasta al ragù').first().waitFor({ timeout: 15000 });
  await cliente.getByRole('button', { name: 'Scritte più grandi' }).click();
  await cliente.waitForTimeout(500);
  verifica(
    'anche il cliente può ingrandire il menù dal telefono',
    (await misuraPagina(cliente)) > 17,
    `${await misuraPagina(cliente)}px`
  );
  verifica('e il menù non sborda dallo schermo', !(await sborda(cliente)));
  await cliente.screenshot({ path: RISULTATI + '/carattere-telefono.png' });

  // --- L'app Utenti --------------------------------------------------------
  const utenti = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  utenti.on('pageerror', (e) => console.log('[utenti] ERRORE PAGINA:', e.message));
  await utenti.goto(UTENTI);
  await utenti.getByLabel('Nome utente').fill('admin');
  await utenti.getByLabel('Password').fill('prova1234');
  await utenti.getByRole('button', { name: 'Entra' }).click();
  await utenti.waitForTimeout(3000);
  await utenti.getByRole('button', { name: 'Scritte più grandi' }).click();
  await utenti.waitForTimeout(600);
  verifica('il tasto c’è anche nell’app Utenti', (await misuraPagina(utenti)) === 19, `${await misuraPagina(utenti)}px`);
  verifica('e l’elenco degli utenti non sborda', !(await sborda(utenti)));
  await utenti.getByRole('button', { name: 'Grandezza normale' }).click();
  await utenti.waitForTimeout(400);

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
