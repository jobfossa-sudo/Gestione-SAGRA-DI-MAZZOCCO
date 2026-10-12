// Il menù delle app: chi entra vede tutti i riquadri, accesi quelli delle app
// in cui può entrare e spenti gli altri; la pagina dei QR (mostrare per tutti,
// stampare solo l'amministratore); il tasto "◀ Menù" nelle app; il colore di
// ciascuna app.
//
//   cd prove && node prova-portale.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat").

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');

const PORTALE = 'http://127.0.0.1:5170/';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

async function entra(browser, utente, indirizzo = PORTALE) {
  const pagina = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  await pagina.addInitScript(() => {
    window.__stampe = 0;
    window.print = () => (window.__stampe += 1);
  });
  await pagina.goto(indirizzo);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2000);
  return pagina;
}

/** Lo stato di ciascun riquadro: acceso (è un collegamento) o spento. */
async function riquadri(pagina) {
  const stato = {};
  for (const nome of ['Comande', 'Contabilità', 'Utenti', 'Magazzino', 'Codici QR']) {
    const riquadro = pagina.locator('.riquadro-app', { hasText: nome });
    const tag = await riquadro.evaluate((el) => el.tagName);
    stato[nome] = tag === 'A' ? 'acceso' : 'spento';
  }
  return stato;
}

(async () => {
  const browser = await chromium.launch();

  // --- Il cassiere ----------------------------------------------------------
  const cassa = await entra(browser, 'cassa');
  verifica('dopo l’accesso si vede il menù delle app', await cassa.getByText('Scegli dove entrare').isVisible());
  const statoCassa = await riquadri(cassa);
  verifica('si vedono tutti e cinque i riquadri', Object.keys(statoCassa).length === 5);
  verifica(
    'al cassiere Comande è acceso, Contabilità e Utenti spenti',
    statoCassa.Comande === 'acceso' && statoCassa['Contabilità'] === 'spento' && statoCassa.Utenti === 'spento',
    JSON.stringify(statoCassa)
  );
  verifica('Magazzino è spento, "in arrivo"', /In arrivo/.test(await cassa.locator('.riquadro-app', { hasText: 'Magazzino' }).innerText()));
  verifica('i riquadri spenti hanno il lucchetto', (await cassa.locator('.riquadro-app.spento .lucchetto').count()) === 3);
  verifica('ogni riquadro ha la sua icona', (await cassa.locator('.riquadro-app .icona-app').count()) === 5);
  await cassa.locator('.riquadro-app', { hasText: 'Contabilità' }).click({ force: true });
  verifica('cliccare un riquadro spento non porta da nessuna parte', cassa.url() === PORTALE);
  await cassa.screenshot({ path: RISULTATI + '/portale-cassa.png', fullPage: true });

  // I colori: ogni riquadro ha quello della sua app.
  const colori = await cassa.evaluate(() =>
    Object.fromEntries(
      ['comande', 'contabilita', 'utenti', 'magazzino'].map((app) => [
        app,
        getComputedStyle(document.documentElement).getPropertyValue(`--app-${app}`).trim(),
      ])
    )
  );
  verifica(
    'i quattro colori delle app',
    colori.comande === '#c2410c' && colori.contabilita === '#0f766e' && colori.utenti === '#6d28d9' && colori.magazzino === '#0369a1',
    JSON.stringify(colori)
  );

  // --- I QR, per chi non è amministratore -------------------------------------
  await cassa.locator('.riquadro-app', { hasText: 'Codici QR' }).click();
  await cassa.waitForTimeout(800);
  verifica('il riquadro QR apre la pagina dei codici', await cassa.getByRole('heading', { name: 'Codici QR' }).isVisible());
  verifica(
    'ci sono il menù dei tavoli e i tre bagni',
    (await cassa.locator('.riquadro-qr').count()) === 4 &&
      (await cassa.locator('.riquadro-qr svg').count()) === 4
  );
  const indirizzi = await cassa.locator('.indirizzo-qr').allInnerTexts();
  verifica(
    'i QR portano alle pagine dei clienti in Comande',
    indirizzi[0] === 'http://127.0.0.1:5173/?menu' && indirizzi.slice(1).every((i) => /5173\/\?bagno=/.test(i)),
    indirizzi.join(' | ')
  );
  verifica('chi non è amministratore non vede i tasti di stampa', (await cassa.getByRole('button', { name: /Stampa/ }).count()) === 0);
  await cassa.getByRole('button', { name: '📱 Mostra' }).first().click();
  verifica('"Mostra" apre il QR grande a schermo', await cassa.locator('.qr-a-schermo svg').isVisible());
  const lato = await cassa.locator('.qr-a-schermo .qr-codice').evaluate((el) => el.getBoundingClientRect().width);
  verifica('ed è davvero grande', lato > 400, `${Math.round(lato)} px`);
  await cassa.screenshot({ path: RISULTATI + '/portale-qr-schermo.png' });
  await cassa.keyboard.press('Escape');
  verifica('si chiude con Esc', (await cassa.locator('.qr-a-schermo').count()) === 0);
  await cassa.getByRole('link', { name: '◀ Menù' }).click();
  verifica('"◀ Menù" riporta ai riquadri', await cassa.getByText('Scegli dove entrare').waitFor({ timeout: 5000 }).then(() => true, () => false));

  // La pagina dei clienti funziona davvero (senza accesso).
  const cliente = await browser.newPage();
  await cliente.goto(indirizzi[0]);
  verifica('il QR del menù apre il menù per i clienti', await cliente.getByLabel('Numero del tavolo').isVisible({ timeout: 10000 }).catch(() => false));
  await cliente.close();

  // --- Il contabile ----------------------------------------------------------
  const contabile = await entra(browser, 'contabile');
  const statoContabile = await riquadri(contabile);
  verifica(
    'al contabile è accesa solo Contabilità (più i QR)',
    statoContabile['Contabilità'] === 'acceso' && statoContabile.Comande === 'spento' && statoContabile.Utenti === 'spento' && statoContabile['Codici QR'] === 'acceso',
    JSON.stringify(statoContabile)
  );

  // --- L'amministratore ----------------------------------------------------------
  const admin = await entra(browser, 'admin');
  const statoAdmin = await riquadri(admin);
  verifica(
    'all’amministratore sono accese tutte le app pronte',
    statoAdmin.Comande === 'acceso' && statoAdmin['Contabilità'] === 'acceso' && statoAdmin.Utenti === 'acceso' && statoAdmin.Magazzino === 'spento',
    JSON.stringify(statoAdmin)
  );
  await admin.screenshot({ path: RISULTATI + '/portale-admin.png', fullPage: true });
  verifica(
    'il riquadro Comande porta all’app Comande',
    (await admin.locator('.riquadro-app', { hasText: 'Comande' }).getAttribute('href')) === 'http://127.0.0.1:5173/'
  );
  await admin.locator('.riquadro-app', { hasText: 'Codici QR' }).click();
  await admin.waitForTimeout(800);
  verifica('l’amministratore vede i tasti di stampa', (await admin.getByRole('button', { name: /🖨 Stampa/ }).count()) >= 4);
  await admin.getByLabel('Quante copie del cartello del menù').fill('3');
  await admin.getByRole('button', { name: '🖨 Stampa 3' }).click();
  await admin.waitForTimeout(800);
  verifica('stampa il cartello del menù in 3 copie', (await admin.evaluate(() => window.__stampe)) === 1);
  await admin.getByRole('button', { name: /tutti e tre i bagni/ }).click();
  await admin.waitForTimeout(800);
  verifica('stampa i cartelli dei tre bagni', (await admin.evaluate(() => window.__stampe)) === 2);

  // --- Il tasto "◀ Menù" e il colore dentro le app ----------------------------------
  for (const [app, porta, colore] of [
    ['Comande', 5173, '#c2410c'],
    ['Utenti', 5174, '#6d28d9'],
    ['Contabilità', 5175, '#0f766e'],
  ]) {
    const pagina = await entra(browser, 'admin', `http://127.0.0.1:${porta}/`);
    const link = pagina.getByRole('link', { name: '◀ Menù' });
    verifica(`${app}: c’è il tasto "◀ Menù"`, (await link.count()) === 1 && (await link.getAttribute('href')) === PORTALE);
    const accento = await pagina.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
    verifica(`${app}: ha il suo colore`, accento === colore, accento);
    await pagina.screenshot({ path: RISULTATI + `/portale-colore-${porta}.png` });
    await pagina.close();
  }
  const comande = await entra(browser, 'admin', 'http://127.0.0.1:5173/');
  verifica('in Comande la scheda QR non c’è più', (await comande.locator('header nav button', { hasText: /^QR$/ }).count()) === 0);

  // Il tema scuro: i colori cambiano insieme al tema.
  await comande.evaluate(() => (document.documentElement.dataset.tema = 'scuro'));
  const scuro = await comande.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  verifica('nel tema scuro il colore dell’app si accende', scuro === '#f97316', scuro);

  await browser.close();
  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
