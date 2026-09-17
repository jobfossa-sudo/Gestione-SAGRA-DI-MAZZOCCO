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

  // Il cliente: un telefono che inquadra il QR del tavolo 7.
  const telefono = await browser.newContext(devices['iPhone 13']);
  const cliente = await telefono.newPage();
  // L'avviso giallo degli emulatori è fisso in fondo e coprirebbe la barra
  // dell'ordine: nel sito vero non esiste.
  await cliente.goto(URL + '?tavolo=7');
  await cliente.addStyleTag({ content: '.firebase-emulator-warning{display:none!important}' }).catch(() => {});
  cliente.on('pageerror', (e) => console.log('[cliente] ERRORE PAGINA:', e.message));
  await cliente.waitForTimeout(2500);

  const testo = await cliente.innerText('body');
  verifica('il QR apre il menù col numero del tavolo', /Tavolo 7/.test(testo));
  verifica('non chiede nessun accesso', !/Nome utente/.test(testo));
  verifica('il menù mostra i piatti con i prezzi', /Pasta al ragù/.test(testo) && /7,00/.test(testo));
  verifica('non mostra le porzioni rimaste', !/Rimaste/i.test(testo));
  verifica('mostra le novità', /novità/i.test(testo));

  await cliente.getByRole('button', { name: 'Aggiungi Gnocchi al pomodoro' }).click();
  await cliente.getByRole('button', { name: 'Aggiungi Gnocchi al pomodoro' }).click();
  await cliente.getByRole('button', { name: 'Aggiungi Acqua' }).click();
  verifica('il totale si aggiorna', /15,00/.test(await cliente.innerText('.barra-ordine')));

  const invio = cliente.getByRole('button', { name: 'Invia alla cassa' });
  verifica('senza il numero di persone non si può inviare', !(await invio.isEnabled()));
  await cliente.getByLabel('Quante persone').fill('4');
  await cliente.waitForTimeout(300);
  verifica('col numero di persone si può inviare', await invio.isEnabled());
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
  await cassa.getByRole('button', { name: 'Conferma bozza' }).click();
  await cassa.waitForTimeout(1500);
  verifica(
    'in cassa l’ordine dal tavolo compare tra quelli arrivati',
    /Arrivati dai tavoli/.test(await cassa.innerText('.conferma-bozza')) &&
      /Gnocchi al pomodoro/.test(await cassa.innerText('.conferma-bozza'))
  );
  await cassa.getByLabel('Numero ordine').fill(numero);
  await cassa.getByRole('button', { name: "Richiama l'ordine" }).click();
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).click();
  await cassa.waitForTimeout(3000);
  const scheda = await cassa.innerText('.conferma-bozza');
  verifica('la cassa conferma e stampa il foglio', /[A-Z]\d{4}/.test(scheda) && /Tavolo 7/.test(scheda), scheda.match(/[A-Z]\d{4}/)[0]);

  // L'amministratore genera i QR dei tavoli.
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
  await admin.getByRole('button', { name: 'QR dei tavoli' }).click();
  await admin.waitForTimeout(2000);
  verifica('l’amministratore vede la griglia dei QR', (await admin.locator('.griglia-qr li').count()) === 20);
  verifica('ogni QR è disegnato', (await admin.locator('.griglia-qr svg').count()) === 20);
  await admin.getByLabel('Quanti tavoli').fill('3');
  await admin.waitForTimeout(1500);
  verifica('si scelgono quanti tavoli', (await admin.locator('.griglia-qr li').count()) === 3);
  await admin.getByRole('button', { name: /Stampa tutti/ }).click();
  await admin.waitForTimeout(2000);
  const stampe = await admin.evaluate(() => window.__stampe);
  verifica('la stampa manda un foglio per tavolo', /Tavolo[\s\S]*1[\s\S]*Tavolo[\s\S]*3/.test(stampe[0] || ''));
  verifica('sul foglio c’è il QR e le istruzioni', /istruzioni-qr/.test(stampe[0] || '') && /<svg/.test(stampe[0] || ''));
  require('fs').writeFileSync(RISULTATI + '/foglio-qr.html', stampe[0] || '');
  await admin.screenshot({ path: RISULTATI + '/qr-tavoli.png', fullPage: true });

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
