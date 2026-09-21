const path = require('node:path');
// Dove finiscono schermate e fogli catturati durante la prova.
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium, devices } = require('playwright');

const URL = 'http://127.0.0.1:5173/';
const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const browser = await chromium.launch();

  // Il cliente: un telefono che inquadra il QR del menù (uno solo per tutti
  // i tavoli) e dichiara lui il tavolo.
  const telefono = await browser.newContext(devices['iPhone 13']);
  const cliente = await telefono.newPage();
  // L'avviso giallo degli emulatori è fisso in fondo e coprirebbe la barra
  // dell'ordine: nel sito vero non esiste.
  await cliente.goto(URL + '?menu');
  await cliente.addStyleTag({ content: '.firebase-emulator-warning{display:none!important}' }).catch(() => {});
  cliente.on('pageerror', (e) => console.log('[cliente] ERRORE PAGINA:', e.message));
  await cliente.waitForTimeout(2500);

  const testo = await cliente.innerText('body');
  verifica('il QR apre il menù del cliente', /Il menù/.test(testo));
  verifica('c’è la casella dove scrivere il tavolo', await cliente.getByLabel('Numero del tavolo').isVisible());
  verifica('non chiede nessun accesso', !/Nome utente/.test(testo));
  verifica('il menù mostra i piatti con i prezzi', /Pasta al ragù/.test(testo) && /7,00/.test(testo));
  verifica('non mostra le porzioni rimaste', !/Rimaste/i.test(testo));
  verifica('mostra le novità', /novità/i.test(testo));

  await cliente.getByRole('button', { name: 'Aggiungi Gnocchi al pomodoro' }).click();
  await cliente.getByRole('button', { name: 'Aggiungi Gnocchi al pomodoro' }).click();
  await cliente.getByRole('button', { name: 'Aggiungi Acqua' }).click();
  verifica('il totale si aggiorna', /15,00/.test(await cliente.innerText('.barra-ordine')));

  const invio = cliente.getByRole('button', { name: 'Invia alla cassa' });
  verifica('senza tavolo e persone non si può inviare', !(await invio.isEnabled()));
  await cliente.getByLabel('Quante persone').fill('4');
  await cliente.waitForTimeout(300);
  verifica('con le persone ma senza tavolo non si invia ancora', !(await invio.isEnabled()));
  await cliente.getByLabel('Numero del tavolo').fill('7');
  await cliente.waitForTimeout(300);
  verifica('scritto il tavolo si può inviare', await invio.isEnabled());
  verifica('la testata mostra il tavolo dichiarato', /Tavolo 7/.test(await cliente.innerText('.testata-qr')));
  await invio.click();
  await cliente.waitForTimeout(3000);

  const inviato = await cliente.innerText('.menu-qr');
  verifica('il cliente riceve il numero da mostrare in cassa', /Ordine inviato/.test(inviato), inviato.split('\n')[3]);
  const numero = (inviato.match(/\n(\d+)\n/) || [])[1];
  verifica('il numero è visibile in grande', !!numero, 'numero ' + numero);
  await cliente.screenshot({ path: RISULTATI + '/menu-qr-inviato.png', fullPage: true });

  // La cassa lo richiama, lo conferma e lo incassa.
  const cassa = await browser.newPage();
  await cassa.addInitScript(() => {
    window.__stampe = [];
    window.print = () => window.__stampe.push('foglio');
  });
  await cassa.goto(URL);
  await cassa.getByLabel('Nome utente').fill('cassa');
  await cassa.getByLabel('Password').fill('prova1234');
  await cassa.getByRole('button', { name: 'Entra' }).click();
  await cassa.waitForTimeout(2500);
  await cassa.getByRole('button', { name: /Da fare/ }).click();
  await cassa.waitForTimeout(1500);
  verifica(
    'in cassa l’ordine dal tavolo compare tra quelli arrivati',
    /dal tavolo/i.test(await cassa.innerText('.da-fare')) &&
      /Gnocchi al pomodoro/.test(await cassa.innerText('.da-fare'))
  );
  await cassa.getByLabel('Numero ordine').fill(numero);
  await cassa.getByRole('button', { name: "Richiama l'ordine" }).click();
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).click();
  await cassa.waitForTimeout(3000);
  const scheda = await cassa.innerText('.da-fare');
  verifica('la cassa conferma e stampa il foglio', /[A-Z]\d{4}/.test(scheda) && /Tavolo 7/.test(scheda), scheda.match(/[A-Z]\d{4}/)[0]);

  // L'amministratore stampa il cartello con il QR del menù.
  const admin = await browser.newPage();
  await admin.addInitScript(() => {
    window.__stampe = [];
    window.print = () => {
      const area = document.querySelector('.area-stampa');
      window.__stampe.push(area ? area.innerHTML : '(vuota)');
    };
  });
  await admin.goto(URL);
  await admin.getByLabel('Nome utente').fill('admin');
  await admin.getByLabel('Password').fill('prova1234');
  await admin.getByRole('button', { name: 'Entra' }).click();
  await admin.waitForTimeout(2000);
  await admin.getByRole('button', { name: 'QR del menù' }).click();
  await admin.waitForTimeout(2500);
  verifica('l’amministratore vede un solo QR', (await admin.locator('.anteprima-cartello svg').count()) === 1);
  verifica(
    'il QR porta al menù senza numero di tavolo',
    /\?menu$/.test(await admin.innerText('.indirizzo-qr')),
    await admin.innerText('.indirizzo-qr')
  );

  await admin.getByLabel('Quante copie').fill('3');
  await admin.waitForTimeout(500);
  await admin.getByRole('button', { name: /Stampa 3 copie/ }).click();
  await admin.waitForTimeout(2500);
  const stampe = await admin.evaluate(() => window.__stampe);
  const foglio = stampe[0] || '';
  verifica('escono tante copie quante chieste', (foglio.match(/class="foglio foglio-qr"/g) || []).length === 3);
  verifica('il cartello porta il nome e l’anno della sagra', /Sagra di Mazzocco/.test(foglio) && /2027/.test(foglio));
  verifica('il cartello è colorato', /banda-qr/.test(foglio) && /cornice-qr/.test(foglio));
  verifica('il cartello porta il QR e le istruzioni', /istruzioni-qr/.test(foglio) && /<svg/.test(foglio));
  verifica('le istruzioni dicono di scrivere il tavolo', /numero del tavolo/i.test(foglio));
  require('fs').writeFileSync(RISULTATI + '/foglio-qr.html', foglio);
  await admin.screenshot({ path: RISULTATI + '/qr-menu.png', fullPage: true });

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
