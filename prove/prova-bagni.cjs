// Le segnalazioni dai bagni: il cliente inquadra il cartello, tocca cosa non
// va, e l'avviso compare sugli schermi di chi sta lavorando.
//
//   cd prove && node prova-bagni.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat").

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium, devices } = require('playwright');

const URL = 'http://127.0.0.1:5173/';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

/** Si aspetta che una cosa diventi vera invece di fidarsi di un'attesa a
 * occhio: l'avviso passa dal server e ci mette quel che ci mette. */
async function attendi(condizione, tentativi = 40, pausa = 500) {
  for (let i = 0; i < tentativi; i++) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return false;
}

async function entra(browser, utente) {
  const pagina = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await pagina.addInitScript(() => {
    window.__stampe = [];
    window.print = () => {
      const area = document.querySelector('.area-stampa');
      window.__stampe.push(area ? area.innerHTML : '(nessuna area di stampa)');
    };
  });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  await pagina.goto(URL);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(3000);
  return pagina;
}

/** Un telefono che ha appena inquadrato il cartello di un bagno. */
async function telefonoInBagno(browser, bagno) {
  const contesto = await browser.newContext(devices['iPhone 13']);
  const pagina = await contesto.newPage();
  pagina.on('pageerror', (e) => console.log('[cliente] ERRORE PAGINA:', e.message));
  await pagina.goto(`${URL}?bagno=${bagno}`);
  await pagina.waitForTimeout(2000);
  return pagina;
}

(async () => {
  const browser = await chromium.launch();

  // Due schermi del personale, di ruoli diversi: l'avviso deve arrivare a
  // tutti e due, qualunque schermata stiano guardando.
  const cassa = await entra(browser, 'cassa');
  const cucina = await entra(browser, 'cucina');

  // --- Il cartello in bagno ------------------------------------------------
  const cliente = await telefonoInBagno(browser, 'disabile');
  const pagina = await cliente.innerText('body');
  verifica('il QR del bagno apre l’elenco delle segnalazioni', /Cosa non va/i.test(pagina));
  verifica('dice a quale bagno si riferisce', /Bagno Disabili/i.test(pagina), pagina.split('\n')[3] ?? '');
  verifica('non chiede nessun accesso', !/Nome utente/.test(pagina));
  verifica(
    'le voci sono quelle previste, e sono sette',
    (await cliente.locator('.elenco-segnalazioni button').count()) === 7
  );
  verifica('non c’è niente da scrivere', (await cliente.locator('input[type=text], textarea').count()) === 0);
  await cliente.screenshot({ path: RISULTATI + '/bagno-telefono.png', fullPage: true });

  await cliente.getByRole('button', { name: 'Water intasato' }).click();
  verifica(
    'toccata la riga, il cliente viene ringraziato',
    await attendi(async () => /Grazie/i.test(await cliente.innerText('body')))
  );
  await cliente.screenshot({ path: RISULTATI + '/bagno-grazie.png', fullPage: true });

  // --- L'avviso sugli schermi di chi lavora --------------------------------
  const avvisoCassa = cassa.locator('.avviso-bagno', { hasText: 'Water intasato' });
  const avvisoCucina = cucina.locator('.avviso-bagno', { hasText: 'Water intasato' });
  verifica(
    'l’avviso arriva in cassa da solo',
    await attendi(async () => (await avvisoCassa.count()) > 0)
  );
  verifica(
    'e arriva anche in cucina, su un’altra schermata',
    await attendi(async () => (await avvisoCucina.count()) > 0)
  );
  const testo = await avvisoCassa.first().innerText();
  verifica('l’avviso dice quale bagno', /bagno disabili/i.test(testo), testo.split('\n')[0]);
  verifica('e cosa c’è da fare', /Water intasato/.test(testo));
  await cassa.screenshot({ path: RISULTATI + '/bagno-avviso.png' });

  // Dieci persone che trovano lo stesso guaio non fanno dieci avvisi.
  const quantiPrima = await cassa.locator('.avviso-bagno').count();
  const altroCliente = await telefonoInBagno(browser, 'disabile');
  await altroCliente.getByRole('button', { name: 'Water intasato' }).click();
  await altroCliente.waitForTimeout(3000);
  await cassa.waitForTimeout(2000);
  verifica(
    'la stessa segnalazione ripetuta non fa un secondo avviso',
    (await cassa.locator('.avviso-bagno').count()) === quantiPrima,
    `${quantiPrima} avvisi`
  );
  verifica(
    'ma chi l’ha mandata viene ringraziato lo stesso',
    /Grazie/i.test(await altroCliente.innerText('body'))
  );

  // --- La ✕ toglie l'avviso solo da questo schermo -------------------------
  await avvisoCassa.first().getByRole('button', { name: 'Togli questo avviso dal mio schermo' }).click();
  verifica(
    'la ✕ lo toglie da questo schermo',
    await attendi(async () => (await avvisoCassa.count()) === 0, 10)
  );
  verifica('ma in cucina resta: nessuno ci è ancora andato', (await avvisoCucina.count()) > 0);

  // --- "Ci penso io" lo toglie da tutti ------------------------------------
  await avvisoCucina.first().getByRole('button', { name: 'Ci penso io' }).click();
  verifica(
    '"Ci penso io" lo toglie dallo schermo di chi lo preme',
    await attendi(async () => (await avvisoCucina.count()) === 0)
  );
  // Si ricarica la cassa: l'avviso non deve tornare, perché qualcuno ci è
  // andato davvero. Chiudere con la ✕ invece non risolveva niente.
  await cassa.reload();
  await cassa.waitForTimeout(3500);
  verifica(
    'e non torna nemmeno ricaricando la pagina',
    (await cassa.locator('.avviso-bagno', { hasText: 'Water intasato' }).count()) === 0
  );

  // --- Un cartello senza bagno non fa danni --------------------------------
  const sbagliato = await telefonoInBagno(browser, 'cucina');
  verifica(
    'un cartello con un bagno che non esiste lo dice e basta',
    /non valido/i.test(await sbagliato.innerText('body'))
  );

  // --- I cartelli da stampare, nella scheda QR -----------------------------
  const admin = await entra(browser, 'admin');
  await admin.getByRole('button', { name: 'QR', exact: true }).click();
  await admin.waitForTimeout(2500);
  verifica('la scheda si chiama solo "QR"', (await admin.locator('header nav button', { hasText: /^QR$/ }).count()) === 1);
  const schermata = await admin.innerText('.qr-schede');
  verifica('tiene insieme il QR del menù e quelli dei bagni', /QR del menù/.test(schermata) && /QR dei bagni/.test(schermata));
  verifica('c’è un cartello per ciascuno dei tre bagni', (await admin.locator('.cartello-bagno').count()) === 3);
  verifica(
    'ogni cartello porta il suo indirizzo',
    /\?bagno=uomini/.test(schermata) && /\?bagno=donne/.test(schermata) && /\?bagno=disabile/.test(schermata)
  );
  verifica('e ciascuno ha il suo QR disegnato', (await admin.locator('.cartello-bagno svg').count()) === 3);

  await admin.getByRole('button', { name: 'Stampa tutti e tre i cartelli' }).click();
  verifica(
    'si stampano tutti e tre in una volta',
    await attendi(async () => (await admin.evaluate(() => window.__stampe.length)) > 0)
  );
  const foglio = (await admin.evaluate(() => window.__stampe))[0] || '';
  verifica('escono tre fogli', (foglio.match(/foglio-qr-bagno/g) || []).length === 3);
  verifica(
    'ognuno dice di che bagno è',
    /Bagno Uomini/.test(foglio) && /Bagno Donne/.test(foglio) && /Bagno Disabili/.test(foglio)
  );
  verifica('e spiega cosa fare', /Qualcosa non va/.test(foglio) && /<svg/.test(foglio));
  require('fs').writeFileSync(RISULTATI + '/foglio-qr-bagni.html', foglio);
  await admin.screenshot({ path: RISULTATI + '/bagni-qr.png', fullPage: true });

  await browser.close();

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
