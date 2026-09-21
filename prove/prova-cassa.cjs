const path = require('node:path');
// Dove finiscono schermate e fogli catturati durante la prova.
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'http://127.0.0.1:5173/';

async function entra(browser, utente, password = 'prova1234') {
  const pagina = await browser.newPage();
  // window.print() non fa nulla in un browser senza schermo: lo sostituisco
  // per catturare il foglio che sarebbe finito sulla carta.
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
  await pagina.getByLabel('Password').fill(password);
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2500);
  return pagina;
}

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ descrizione, ok: !!condizione, extra });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  const cassa = await entra(browser, 'cassa');

  // --- Nuovo ordine: conferma e stampa ---
  await cassa.getByRole('button', { name: 'Aggiungi Pasta al ragù' }).click();
  await cassa.getByRole('button', { name: 'Aggiungi Birra' }).click();
  await cassa.getByLabel('Tavolo').fill('12');
  await cassa.getByLabel('Coperti').fill('3');
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).click();
  await cassa.waitForTimeout(3000);

  const testoIncasso = await cassa.innerText('.colonna-riepilogo');
  verifica('dopo la conferma compare la scheda da incassare', /Da incassare/.test(testoIncasso));
  const codice = (testoIncasso.match(/[A-Z]\d{4}/) || [])[0];
  verifica('la scheda mostra il numero di comanda', !!codice, codice);
  verifica('il tasto per inviare si è acceso', await cassa.getByRole('button', { name: 'Invia ordine' }).isEnabled());

  const stampe = await cassa.evaluate(() => window.__stampe);
  verifica('il foglio per il cliente è andato in stampa da solo', stampe.length === 1);
  const foglio = stampe[0] || '';
  verifica('il foglio riporta il numero di comanda', foglio.includes(codice));
  verifica('il foglio riporta il codice a barre disegnato', /<svg[^>]*codice-a-barre[\s\S]*<rect/.test(foglio));
  verifica('sotto il codice c’è la riga leggibile', /· Cassa A/.test(foglio.replace(/<[^>]+>/g, '')));
  verifica('il foglio riporta tavolo e coperti', /blocco-tavolo[\s\S]*12/.test(foglio) && /3 coperti/.test(foglio));
  fs.writeFileSync(RISULTATI + '/foglio-resoconto.html', foglio);

  // Prima dell'incasso i reparti non vedono niente.
  const cucina = await entra(browser, 'cucina');
  const quantoInCucina = async (voce) => {
    const testo = await cucina.innerText('.pannello-unico');
    const trovato = new RegExp(voce + '\\s+(\\d+)').exec(testo);
    return trovato ? Number(trovato[1]) : null;
  };
  const pastaPrima = await quantoInCucina('Pasta al ragù');

  // --- Incasso e invio ---
  await cassa.getByRole('button', { name: 'Invia ordine' }).click();
  await cassa.waitForTimeout(3000);
  const dopoInvio = await cassa.innerText('.colonna-riepilogo');
  verifica('dopo l’invio la cassa torna al carrello vuoto', /Tocca i prodotti/.test(dopoInvio));
  verifica('e conferma che l’ordine è partito', /incassato e inviato ai reparti/.test(dopoInvio), dopoInvio.slice(0, 120));

  await cucina.waitForTimeout(2500);
  const pastaDopo = await quantoInCucina('Pasta al ragù');
  verifica(
    'solo dopo l’incasso la pasta arriva in cucina',
    pastaDopo === pastaPrima + 1,
    `prima ${pastaPrima}, dopo ${pastaDopo}`
  );

  // --- Ordine dal QR: stesso giro ---
  const bozza = await cassa.evaluate(async () => {
    const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import(
      'https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js'
    );
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
    const app = initializeApp({ projectId: 'gestione-sagra-mazzocco', apiKey: 'finta' }, 'cliente-qr');
    const funzioni = getFunctions(app);
    connectFunctionsEmulator(funzioni, '127.0.0.1', 5001);
    const crea = httpsCallable(funzioni, 'creaOrdineBozza');
    const risposta = await crea({
      serataId: new Date().toISOString().slice(0, 10),
      tavolo: 7,
      coperti: 2,
      items: [{ prodottoId: 'gnocchi', quantita: 2 }],
    });
    return risposta.data;
  });
  verifica('un cliente dal QR crea una bozza', !!bozza.numero, 'numero ' + bozza.numero);

  await cassa.getByRole('button', { name: /Da fare/ }).click();
  await cassa.getByLabel('Numero ordine').fill(String(bozza.numero));
  await cassa.getByRole('button', { name: "Richiama l'ordine" }).click();
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).waitFor();
  const resoconto = await cassa.innerText('.da-fare');
  verifica('il resoconto della bozza si fa controllare al cliente', /da pagare/i.test(resoconto));
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).click();
  await cassa.waitForTimeout(3000);
  const stampeDopoQr = await cassa.evaluate(() => window.__stampe.length);
  verifica('anche la bozza confermata stampa il suo foglio', stampeDopoQr === 2);
  const schedaQr = await cassa.innerText('.da-fare');
  const codiceQr = (schedaQr.match(/[A-Z]\d{4}/) || [])[0];
  verifica('la bozza prende il numero di comanda della cassa', /^A\d{4}$/.test(codiceQr || ''), codiceQr);

  // --- Il cliente se ne va senza pagare: annullamento ---
  cassa.on('dialog', (d) => d.accept());
  await cassa.getByRole('button', { name: 'Annulla ordine' }).click();
  await cassa.waitForTimeout(3000);
  const dopoAnnullo = await cassa.innerText('.da-fare');
  verifica('l’ordine non pagato si annulla', /annullato: non è mai partito/.test(dopoAnnullo), dopoAnnullo.slice(0, 120));

  // --- Ordine messo da parte, ripreso dalla scheda "Da fare", e fine serata ---
  await cassa.getByRole('button', { name: 'Nuovo ordine', exact: true }).click();
  await cassa.getByRole('button', { name: 'Aggiungi Patatine fritte' }).click();
  await cassa.getByLabel('Tavolo').fill('4');
  await cassa.getByLabel('Coperti').fill('2');
  await cassa.getByRole('button', { name: 'Conferma e stampa' }).click();
  await cassa.waitForTimeout(2500);
  await cassa.getByRole('button', { name: 'Metti da parte' }).click();
  await cassa.getByRole('button', { name: /Da fare/ }).click();
  await cassa.waitForTimeout(1500);
  const elenco = await cassa.innerText('.da-fare');
  verifica(
    'l’ordine messo da parte resta nell’elenco "Da fare"',
    /da incassare/i.test(elenco) && /Patatine/.test(elenco)
  );
  await cassa.getByRole('button', { name: 'Apri' }).first().click();
  await cassa.waitForTimeout(1000);
  verifica(
    'da lì si può incassare anche più tardi',
    await cassa.getByRole('button', { name: 'Invia ordine' }).isEnabled()
  );
  verifica(
    'riaprendolo non ristampa il foglio da sola',
    (await cassa.evaluate(() => window.__stampe.length)) === 3
  );

  await cassa.screenshot({ path: RISULTATI + '/cassa-da-fare.png', fullPage: true });
  await cassa.getByRole('button', { name: 'Fine serata' }).click();
  await cassa.waitForTimeout(1500);
  const fine = await cassa.innerText('.fine-serata');
  verifica('a fine serata si vedono gli ordini confermati e non incassati', /Confermati e non incassati/.test(fine));

  // Il foglio catturato, disegnato come uscirebbe su carta.
  const anteprima = await browser.newPage();
  const css = await (await fetch('http://127.0.0.1:5173/src/App.css')).text().catch(() => '');
  await anteprima.setContent(
    `<style>${css.replace(/@media print\s*\{/g, '@media all {')}</style><div class="area-stampa" style="display:block">${foglio}</div>`
  );
  await anteprima.pdf({ path: RISULTATI + '/foglio-resoconto.pdf', format: 'A5', printBackground: true });

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok);
  console.log(`\n${esiti.length - falliti.length}/${esiti.length} controlli passati.`);
  process.exit(falliti.length === 0 ? 0 : 1);
})();
