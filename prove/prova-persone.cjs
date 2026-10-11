// Le persone della sagra e le loro presenze: l'app Utenti con nome, cognome,
// N. utente e ruolo unico (anche "nessun accesso"), e in Contabilità le
// presenze staff con le ore, fino al riepilogo per persona del Report.
//
//   cd prove && node prova-persone.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat"). Quello che la prova
// crea lo cancella alla fine, così si può ripetere.

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');

const UTENTI = 'http://127.0.0.1:5174/';
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

async function entra(browser, indirizzo, utente, password = 'prova1234') {
  const pagina = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  // Le domande "sei sicuro?" si accettano da sole.
  pagina.on('dialog', (d) => d.accept());
  await pagina.goto(indirizzo);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill(password);
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2500);
  return pagina;
}

(async () => {
  const browser = await chromium.launch();
  // Un cognome diverso a ogni giro: la prova non inciampa in quella di prima.
  const suffisso = String(Date.now()).slice(-6);
  const cognome = `Prova${suffisso}`;
  const nomeUtente = `prova${suffisso}`;
  const riga = (pagina) => pagina.locator('.tabella-utenti tbody tr', { hasText: cognome }).first();

  // --- App Utenti: una persona senza accesso ------------------------------
  const admin = await entra(browser, UTENTI, 'admin');
  verifica('il modulo chiede Nome, Cognome e Ruolo', await admin.getByLabel('Cognome', { exact: true }).isVisible());
  verifica(
    'il ruolo parte da "nessun accesso"',
    (await admin.locator('.nuovo-utente .scelta-ruolo').inputValue()) === 'nessuno'
  );
  verifica('senza accesso non chiede né N. utente né password', (await admin.getByLabel('N. utente').count()) === 0);

  await admin.getByLabel('Nome', { exact: true }).fill('Ada');
  await admin.getByLabel('Cognome', { exact: true }).fill(cognome);
  await admin.getByRole('button', { name: 'Aggiungi' }).click();
  verifica('la persona compare in elenco', await attendi(async () => (await riga(admin).count()) > 0));
  verifica('senza N. utente', /—/.test(await riga(admin).locator('td').nth(2).innerText()));

  // Con un ruolo vero il modulo chiede le credenziali.
  await admin.locator('.nuovo-utente .scelta-ruolo').selectOption('cucina');
  verifica('scegliendo un ruolo compaiono N. utente e password', await admin.getByLabel('N. utente').isVisible());
  await admin.locator('.nuovo-utente .scelta-ruolo').selectOption('nessuno');

  // --- Dare un ruolo a chi non ce l'aveva -----------------------------------
  await riga(admin).locator('.scelta-ruolo').selectOption('cucina');
  verifica(
    'dandole un ruolo, la riga chiede nome utente e password',
    await attendi(async () => (await admin.locator('.riga-richiesta').count()) > 0)
  );
  await admin.locator('.riga-richiesta').getByLabel('N. utente').fill(nomeUtente);
  await admin.locator('.riga-richiesta').getByLabel('Password').fill('password-prova');
  await admin.locator('.riga-richiesta').getByRole('button', { name: 'Salva' }).click();
  verifica(
    'ora ha il suo N. utente',
    await attendi(async () => (await riga(admin).locator('.nome-utente').count()) > 0 &&
      (await riga(admin).locator('.nome-utente').innerText()) === nomeUtente)
  );
  verifica('e il ruolo Cucina', (await riga(admin).locator('.scelta-ruolo').inputValue()) === 'cucina');
  await admin.screenshot({ path: RISULTATI + '/utenti-persone.png', fullPage: true });

  // Ed entra davvero, con quello che le è stato dato.
  const ada = await entra(browser, 'http://127.0.0.1:5173/', nomeUtente, 'password-prova');
  verifica('con il nome utente nuovo si entra in Comande', !(await ada.getByRole('button', { name: 'Entra' }).isVisible()));
  await ada.close();

  // --- Correggere il nome ---------------------------------------------------
  await riga(admin).getByRole('button', { name: 'Modifica nome' }).click();
  await admin.locator('.riga-richiesta').getByLabel('Nome', { exact: true }).fill('Adele');
  await admin.locator('.riga-richiesta').getByRole('button', { name: 'Salva' }).click();
  verifica('il nome si corregge', await attendi(async () => /Adele/.test(await riga(admin).innerText())));

  // --- Tornare a "nessun accesso" -------------------------------------------
  await riga(admin).locator('.scelta-ruolo').selectOption('nessuno');
  verifica(
    'togliendo il ruolo sparisce il N. utente, la persona resta',
    await attendi(async () => (await riga(admin).locator('.nome-utente').count()) === 0)
  );

  // --- Contabilità: le presenze di una giornata -------------------------------
  const conti = await entra(browser, CONTABILITA, 'contabile');
  await conti.getByRole('button', { name: 'Presenze' }).click();
  await conti.waitForTimeout(1000);
  verifica(
    'nell’appello c’è anche chi non ha un accesso',
    await attendi(async () => (await conti.locator('.tabella-presenze tbody tr', { hasText: cognome }).count()) > 0)
  );

  // Una data di gennaio solo di questa prova, scelta dal calendario.
  const anno = new Date().getFullYear();
  const data = `${anno}-01-${String((Number(suffisso) % 27) + 1).padStart(2, '0')}`;
  await conti.getByLabel('Data', { exact: true }).fill(data);
  await conti.waitForTimeout(800);
  verifica(
    'una data senza serata si propone come preparazione, senza servizio',
    (await conti.getByLabel('Tipo di giornata').inputValue()) === 'preparazione' &&
      (await conti.getByLabel('Servizio dalle').count()) === 0
  );

  // Diventa una serata di sagra, dalle 19 all'una: 6 ore a testa.
  await conti.getByLabel('Tipo di giornata').selectOption('sagra');
  await conti.getByLabel('Servizio dalle').fill('19:00');
  await conti.getByLabel('alle', { exact: true }).fill('01:00');
  verifica(
    'l’orario oltre mezzanotte fa 6 ore',
    await attendi(async () => (await conti.locator('.durata-servizio strong').innerText()).trim() === '6')
  );

  const rigaAda = () => conti.locator('.tabella-presenze tbody tr', { hasText: cognome }).first();
  await rigaAda().getByLabel(/^Servizio serata:/).check();
  await rigaAda().getByLabel(/^Ore extra:/).fill('2,5');
  await rigaAda().getByLabel(/^Ore extra:/).press('Enter');
  verifica(
    'scrivendo le ore extra si spunta da sola la presenza extra',
    await attendi(async () => rigaAda().getByLabel(/^Presenza extra:/).isChecked())
  );
  verifica(
    'e le ore totali sono servizio + extra (6 + 2,5)',
    await attendi(async () => (await rigaAda().locator('td').last().innerText()).trim() === '8,5')
  );

  await conti.getByRole('button', { name: 'Tutti presenti' }).click();
  await conti.getByLabel('Ore extra a tutti i presenti').fill('1');
  await conti.getByRole('button', { name: 'Applica' }).click();
  verifica(
    '"Ore extra a tutti" vale per tutti i presenti',
    await attendi(async () => (await rigaAda().getByLabel(/^Ore extra:/).inputValue()) === '1')
  );
  await conti.screenshot({ path: RISULTATI + '/contabilita-giornata.png', fullPage: true });

  // --- Le stampe -----------------------------------------------------------------
  await conti.evaluate(() => {
    window.__stampe = 0;
    window.print = () => {
      window.__stampe += 1;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await conti.getByRole('button', { name: /Stampa le giornate/ }).click();
  verifica('il tasto stampa le giornate', await attendi(async () => (await conti.evaluate(() => window.__stampe)) === 1));
  await conti.getByRole('button', { name: /Stampa il totale/ }).click();
  verifica('e il tasto stampa il totale', await attendi(async () => (await conti.evaluate(() => window.__stampe)) === 2));

  // Il foglio della tabella unica, guardato come uscirebbe dalla stampante.
  await conti.evaluate(() => {
    window.print = () => {};
  });
  await conti.getByRole('button', { name: /Stampa le giornate/ }).click();
  await conti.emulateMedia({ media: 'print' });
  await conti.waitForTimeout(300);
  const rigaFoglio = conti.locator('.foglio-stampa tbody tr', { hasText: cognome });
  verifica(
    'il foglio ha la persona con le sue 7 ore (6 + 1)',
    (await rigaFoglio.count()) > 0 && (await rigaFoglio.locator('td').last().innerText()).trim() === '7'
  );
  await conti.screenshot({ path: RISULTATI + '/contabilita-stampa-giornate.png', fullPage: true });
  await conti.emulateMedia({ media: 'screen' });
  await conti.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // --- Il report per persona --------------------------------------------------
  await conti.getByRole('button', { name: 'Report' }).click();
  const rigaReport = conti.locator('.tabella-ore tbody tr', { hasText: cognome });
  verifica(
    'il Report mostra le ore della persona',
    await attendi(async () => (await rigaReport.count()) > 0 && (await rigaReport.locator('td').last().innerText()).trim() === '7'),
    (await rigaReport.count()) > 0 ? await rigaReport.innerText() : 'riga assente'
  );

  // --- Pulizia ----------------------------------------------------------------
  await conti.getByRole('button', { name: 'Presenze' }).click();
  await conti.getByLabel('Data', { exact: true }).fill(data);
  await conti.waitForTimeout(800);
  await conti.getByRole('button', { name: 'Elimina questa giornata' }).click();
  verifica(
    'la giornata si elimina',
    await attendi(async () => (await conti.getByRole('button', { name: 'Elimina questa giornata' }).count()) === 0)
  );

  await riga(admin).getByRole('button', { name: 'Elimina' }).click();
  verifica('la persona di prova si elimina', await attendi(async () => (await riga(admin).count()) === 0));

  await browser.close();
  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
