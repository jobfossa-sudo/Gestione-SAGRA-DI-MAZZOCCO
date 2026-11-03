// Prova l'app installabile: il sito costruito (dist-prova, collegato agli
// emulatori) si installa, si apre senza rete, non finisce nei telefoni dei
// clienti e propone le versioni nuove con il tasto "Aggiorna".
//
//   npm run build:prova          (dalla radice, una volta)
//   cd prove && node prova-pwa.cjs
//
// Serve il sistema di prova acceso (Avvia in locale.bat) per l'accesso.
// In sviluppo (npm run dev) l'app installabile non c'è: va provata così.

const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const RADICE = path.join(__dirname, '..');
const SITO = path.join(RADICE, 'dist-prova');
const RISULTATI = path.join(__dirname, 'risultati');
fs.mkdirSync(RISULTATI, { recursive: true });

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

/** Aspetta che la copia del sito sia installata e guidi la pagina. */
const copiaAttiva = (pagina) =>
  pagina.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });

(async () => {
  if (!fs.existsSync(path.join(SITO, 'sw.js'))) {
    console.log('Manca dist-prova: dalla radice lancia prima "npm run build:prova".');
    process.exit(1);
  }
  const { servi, PORTA } = await import(pathToFileURL(path.join(RADICE, 'scripts', 'servi.mjs')).href);
  const server = await servi(SITO);
  const SITO_URL = `http://127.0.0.1:${PORTA}`;
  const browser = await chromium.launch();
  const copiaSw = fs.readFileSync(path.join(SITO, 'sw.js'), 'utf8');

  try {
    // --- La scheda dell'app --------------------------------------------------------
    const contesto = await browser.newContext();
    const pagina = await contesto.newPage();
    pagina.on('pageerror', (e) => console.log('ERRORE PAGINA:', e.message));
    await pagina.goto(`${SITO_URL}/`);
    const scheda = await pagina.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      const risposta = await fetch(link.href);
      return { tipo: risposta.headers.get('content-type'), ...(await risposta.json()) };
    });
    verifica('il sito si presenta come app: "Sagra di Mazzocco"', scheda.name === 'Sagra di Mazzocco' && scheda.short_name === 'Sagra');
    verifica('si apre a tutto schermo e copre tutto il sito', scheda.display === 'standalone' && scheda.scope === '/' && scheda.start_url === '/');
    const icone = await pagina.evaluate(async (elenco) => {
      const esiti = [];
      for (const icona of elenco) {
        const r = await fetch(icona.src);
        esiti.push(`${icona.sizes}:${r.status}:${r.headers.get('content-type')}`);
      }
      return esiti;
    }, scheda.icons);
    verifica(
      'ci sono le icone per Android e PC (192 e 512, anche quella a tutto tondo)',
      ['192x192', '512x512'].every((m) => icone.some((i) => i.startsWith(`${m}:200:image/png`))) &&
        scheda.icons.some((i) => i.purpose === 'maskable'),
      icone.join(' '),
    );
    const iPhone = await pagina.evaluate(async () => {
      const link = document.querySelector('link[rel="apple-touch-icon"]');
      return link ? (await fetch(link.href)).status : 0;
    });
    verifica('c’è l’icona per iPhone', iPhone === 200);
    const scorciatoie = (scheda.shortcuts ?? []).map((s) => s.url).join(' ');
    verifica('tenendo premuta l’icona si va dritti alle app', /\/comande\//.test(scorciatoie) && /\/contabilita\//.test(scorciatoie), scorciatoie);

    // --- La copia nel dispositivo -----------------------------------------------------
    await copiaAttiva(pagina);
    verifica('la copia del sito si installa e guida la pagina', true);
    const copiate = await pagina.evaluate(async () => {
      const cerca = (indirizzo) => caches.match(indirizzo, { ignoreSearch: true }).then((r) => !!r);
      return {
        menu: await cerca('/index.html'),
        comande: await cerca('/comande/index.html'),
        contabilita: await cerca('/contabilita/index.html'),
        utenti: await cerca('/utenti/index.html'),
      };
    });
    verifica('dentro ci sono tutte le app, non solo il menù', Object.values(copiate).every(Boolean), JSON.stringify(copiate));
    verifica(
      'la vecchia Comande installabile da sola non c’è più',
      (await pagina.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope))).every(
        (s) => !s.endsWith('/comande/'),
      ),
    );

    // --- Senza rete --------------------------------------------------------------------
    await contesto.setOffline(true);
    for (const [nome, indirizzo] of [
      ['il menù', '/'],
      ['Comande', '/comande/'],
      ['Contabilità', '/contabilita/'],
      ['Utenti', '/utenti/'],
    ]) {
      let aperta = false;
      try {
        await pagina.goto(`${SITO_URL}${indirizzo}`, { timeout: 15000 });
        await pagina.getByLabel('Nome utente').waitFor({ timeout: 15000 });
        aperta = true;
      } catch {
        // resta falso
      }
      verifica(`senza rete si apre ${nome}`, aperta);
    }
    await pagina.screenshot({ path: path.join(RISULTATI, 'pwa-senza-rete.png') });
    await contesto.setOffline(false);

    // --- Con la rete: un accesso solo, sugli emulatori ----------------------------------
    await pagina.goto(`${SITO_URL}/`);
    await pagina.getByLabel('Nome utente').fill('admin');
    await pagina.getByLabel('Password').fill('prova1234');
    await pagina.getByRole('button', { name: 'Entra', exact: true }).click();
    await pagina.locator('.griglia-app').waitFor({ timeout: 20000 });
    verifica('si entra con gli utenti di prova (la versione di prova usa gli emulatori)', true);
    verifica('nel menù c’è come installare l’app', /Installa l’app|Installa l'app/.test(await pagina.locator('.installazione').innerText()));
    await pagina.screenshot({ path: path.join(RISULTATI, 'pwa-menu.png') });
    await pagina.goto(`${SITO_URL}/comande/`);
    await pagina.locator('header.barra-titolo').waitFor({ timeout: 20000 });
    verifica('da lì Comande si apre senza chiedere di nuovo la password', (await pagina.getByLabel('Nome utente').count()) === 0);

    // --- Versione nuova: l'avviso, non il ricaricamento da solo -------------------------
    fs.writeFileSync(path.join(SITO, 'sw.js'), `${copiaSw}\n// versione nuova di prova ${Date.now()}\n`);
    await pagina.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
    const avviso = pagina.locator('.avviso-aggiornamento');
    let comparso = false;
    try {
      await avviso.waitFor({ timeout: 20000 });
      comparso = true;
    } catch {
      // resta falso
    }
    verifica('pubblicata una versione nuova, compare "È pronta una nuova versione"', comparso);
    verifica('e la pagina non si è ricaricata da sola', (await pagina.locator('header.barra-titolo').count()) === 1);
    await pagina.screenshot({ path: path.join(RISULTATI, 'pwa-aggiorna.png') });
    if (comparso) {
      await Promise.all([pagina.waitForEvent('load', { timeout: 20000 }), avviso.getByRole('button', { name: 'Aggiorna' }).click()]);
      await pagina.locator('header.barra-titolo').waitFor({ timeout: 20000 });
      const inAttesa = await pagina.evaluate(async () => (await navigator.serviceWorker.getRegistration()).waiting !== null);
      verifica('premuto "Aggiorna", la pagina si ricarica con la versione nuova', !inAttesa && (await avviso.count()) === 0);
    }
    fs.writeFileSync(path.join(SITO, 'sw.js'), copiaSw);

    // --- Il colore della barra del telefono segue il tema -----------------------------
    await pagina.evaluate(() => localStorage.setItem('tema', 'scuro'));
    await pagina.reload();
    await pagina.locator('header.barra-titolo').waitFor();
    const barra = await pagina.evaluate(() => document.querySelector('meta[name="theme-color"]').content);
    verifica('nel tema scuro la barra del telefono diventa antracite', barra === '#0e1217', barra);
    await contesto.close();

    // --- I clienti del QR non si portano a casa l'app --------------------------------------
    const cliente = await browser.newContext();
    const menu = await cliente.newPage();
    await menu.goto(`${SITO_URL}/comande/?menu`);
    await menu.waitForTimeout(4000);
    verifica(
      'chi apre il menù dal QR del tavolo non scarica l’app',
      (await menu.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0,
    );
    await menu.goto(`${SITO_URL}/comande/?bagno=donne`);
    await menu.waitForTimeout(3000);
    verifica(
      'e nemmeno chi segnala dal bagno',
      (await menu.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0,
    );

    // --- La vecchia copia di Comande si cancella da sola ------------------------------------
    // Come un telefono che aveva Comande installabile per conto suo: il browser
    // va a cercarne gli aggiornamenti in /comande/sw.js e trova chi la toglie.
    await menu.evaluate(() => navigator.serviceWorker.register('/comande/sw.js', { scope: '/comande/' }));
    await menu.waitForTimeout(4000);
    verifica(
      'la vecchia copia di Comande si toglie da sola',
      (await menu.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)) === 0,
    );
    await cliente.close();
  } finally {
    fs.writeFileSync(path.join(SITO, 'sw.js'), copiaSw);
    await browser.close();
    server.close();
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
