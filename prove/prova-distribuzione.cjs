const path = require('node:path');
// Dove finiscono schermate e fogli catturati durante la prova.
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');
const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();
const SERATA = new Date().toISOString().slice(0, 10);

const URL = 'http://127.0.0.1:5173/';
const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ descrizione, ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

async function entra(browser, utente) {
  const pagina = await browser.newPage();
  await pagina.addInitScript(() => {
    window.__stampe = [];
    window.print = () => {
      const area = document.querySelector('.area-stampa');
      window.__stampe.push(area ? area.innerHTML : '(vuota)');
    };
  });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  await pagina.goto(URL);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2500);
  return pagina;
}

(async () => {
  const browser = await chromium.launch();

  // La Distribuzione resta aperta, come su un computer alla sagra.
  const distribuzione = await entra(browser, 'distribuzione');
  verifica(
    'chi ha il ruolo distribuzione vede la sua postazione',
    /Lettura del codice a barre/.test(await distribuzione.innerText('.distribuzione'))
  );

  // Ordini già in lavorazione da prove precedenti: la Distribuzione stampa
  // anche quelli, quindi si conta da qui in avanti.
  await distribuzione.waitForTimeout(3000);
  const stampePrima = await distribuzione.evaluate(() => window.__stampe.length);

  const cucina = await entra(browser, 'cucina');
  const quantoInCucina = async (voce) => {
    const testo = await cucina.innerText('.pannello-unico');
    const trovato = new RegExp(voce + '\\s+(\\d+)').exec(testo);
    return trovato ? Number(trovato[1]) : null;
  };
  const pastaPrima = await quantoInCucina('Pasta al ragù');

  // La cassa batte un ordine e lo incassa.
  const cassa = await entra(browser, 'cassa');
  await cassa.getByRole('button', { name: 'Aggiungi Pasta al ragù' }).click();
  await cassa.getByLabel('Tavolo').fill('21');
  await cassa.getByLabel('Coperti').fill('2');
  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  await cassa.waitForTimeout(4000);

  // In Distribuzione la copia cucina esce da sola.
  await distribuzione.waitForTimeout(3000);
  const stampe = await distribuzione.evaluate(() => window.__stampe);
  verifica(
    'la copia cucina esce da sola appena l’ordine è pagato',
    stampe.length === stampePrima + 1,
    `prima ${stampePrima}, dopo ${stampe.length}`
  );
  const copia = stampe[stampe.length - 1] || '';
  verifica('la copia cucina porta il tavolo', /blocco-tavolo[\s\S]*21/.test(copia));
  verifica('la copia cucina non porta i prezzi', !/€/.test(copia));
  verifica('la copia cucina porta il codice a barre', /codice-a-barre[\s\S]*<rect/.test(copia));
  verifica('la copia cucina elenca i piatti', /Pasta al ragù/.test(copia));
  fs.writeFileSync(RISULTATI + '/foglio-copia-cucina.html', copia);

  const elenco = await distribuzione.innerText('.distribuzione');
  verifica('il vassoio compare tra quelli da comporre', /Vassoi da comporre/.test(elenco) && /Tavolo 21/.test(elenco));

  // Ristampa: esce un secondo foglio solo su richiesta.
  await distribuzione.getByRole('button', { name: 'Ristampa' }).first().click();
  await distribuzione.waitForTimeout(1000);
  verifica(
    'la ristampa fa uscire un altro foglio',
    (await distribuzione.evaluate(() => window.__stampe.length)) === stampePrima + 2
  );

  // Un'altra pagina di Distribuzione non deve far uscire un doppione.
  const secondaPostazione = await entra(browser, 'distribuzione');
  await secondaPostazione.waitForTimeout(3000);
  verifica(
    'un secondo computer non stampa un doppione',
    (await secondaPostazione.evaluate(() => window.__stampe.length)) === 0
  );

  // Codici sbagliati: messaggi chiari, niente danni.
  const casella = distribuzione.getByLabel(/Passa la copia cucina/);
  await casella.fill('ciao');
  await casella.press('Enter');
  await distribuzione.waitForTimeout(1500);
  verifica(
    'un testo qualsiasi viene rifiutato con un messaggio',
    /non è il codice di una comanda/.test(await distribuzione.innerText('.esito-errore'))
  );

  await casella.fill('Z9999200001011200Z');
  await casella.press('Enter');
  await distribuzione.waitForTimeout(1500);
  verifica(
    'un foglio di un’altra serata viene rifiutato',
    /non è di questa serata/.test(await distribuzione.innerText('.esito-errore'))
  );

  // Il codice vero: chiude l'ordine.
  const ordini = await db.collection(`serate/${SERATA}/ordini`).where('stato', '==', 'in_evasione').get();
  const ordine = ordini.docs.map((d) => d.data()).find((o) => o.tavolo === 21);
  await casella.fill(ordine.codiceBarre);
  await casella.press('Enter');
  await distribuzione.waitForTimeout(2500);
  const esitoOk = await distribuzione.innerText('.esito-ok');
  verifica('la lettura del codice chiude l’ordine', /consegnato/.test(esitoOk), esitoOk);
  verifica(
    'il vassoio esce dall’elenco',
    !/Tavolo 21/.test(await distribuzione.innerText('.distribuzione'))
  );
  verifica('la casella si svuota e resta pronta', (await casella.inputValue()) === '');

  await cucina.waitForTimeout(2500);
  const pastaDopo = await quantoInCucina('Pasta al ragù');
  verifica('in cucina il numero è tornato come prima', pastaDopo === pastaPrima, `prima ${pastaPrima}, dopo ${pastaDopo}`);

  await casella.fill(ordine.codiceBarre);
  await casella.press('Enter');
  await distribuzione.waitForTimeout(2000);
  verifica(
    'lo stesso foglio letto due volte avvisa',
    /già stato consegnato/.test(await distribuzione.innerText('.esito-errore'))
  );

  // PROVVISORIO — il tasto "Consegnato" sostituisce il lettore finché non
  // c'è. Manda al server lo stesso codice a barre del foglio, quindi il giro
  // provato è quello vero. Da togliere insieme al tasto.
  await cassa.getByRole('button', { name: 'Aggiungi Patatine fritte' }).click();
  await cassa.getByLabel('Tavolo').fill('22');
  await cassa.getByLabel('Coperti').fill('2');
  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  await cassa.waitForTimeout(4000);
  await distribuzione.waitForTimeout(2500);

  const tastiConsegnato = distribuzione.getByRole('button', { name: 'Consegnato' });
  if ((await tastiConsegnato.count()) > 0) {
    const codiceVassoio = ((await distribuzione.innerText('.elenco-vassoi')).match(/[A-Z]\d{4}/) || [])[0];
    await tastiConsegnato.first().click();
    await distribuzione.waitForTimeout(2500);
    verifica(
      'PROVVISORIO: il tasto "Consegnato" chiude l’ordine come farebbe il lettore',
      new RegExp(codiceVassoio + ' consegnato').test(await distribuzione.innerText('.esito-ok')),
      codiceVassoio
    );
  } else {
    verifica('PROVVISORIO: c’era un vassoio su cui provare il tasto "Consegnato"', false);
  }

  await distribuzione.screenshot({ path: RISULTATI + '/distribuzione.png', fullPage: true });
  await browser.close();
  const falliti = esiti.filter((e) => !e.ok).length;
  console.log(`\n${esiti.length - falliti}/${esiti.length} controlli passati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
