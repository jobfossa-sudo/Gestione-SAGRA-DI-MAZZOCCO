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

  // --- Contabilità: la presenza staff ---------------------------------------
  const conti = await entra(browser, CONTABILITA, 'contabile');
  await conti.getByRole('button', { name: 'Presenze' }).click();
  await conti.waitForTimeout(1000);
  verifica('le presenze hanno i due modi, servizio e staff', await conti.getByRole('tab', { name: /Staff/ }).isVisible());
  verifica(
    'nel servizio c’è anche chi non ha un accesso',
    await attendi(async () => (await conti.locator('.tabella-presenze tbody tr', { hasText: cognome }).count()) > 0)
  );

  await conti.getByRole('tab', { name: /Staff/ }).click();
  // Una data fuori dalla sagra e solo di questa prova, per non mescolarsi.
  const anno = new Date().getFullYear();
  const data = `${anno}-01-${String((Number(suffisso) % 27) + 1).padStart(2, '0')}`;
  await conti.getByLabel('Data').fill(data);
  await conti.getByLabel('Tipo').selectOption('smontaggio');
  await conti.getByRole('button', { name: '+ Nuova giornata' }).click();
  verifica(
    'si crea una giornata di smontaggio',
    await attendi(async () => /Smontaggio/.test(await conti.locator('.scelta-giornata select').innerText()))
  );
  await conti.locator('.scelta-giornata select').selectOption(`${data}-smontaggio`);
  await conti.waitForTimeout(800);

  const rigaStaff = () => conti.locator('.tabella-presenze tbody tr', { hasText: cognome }).first();
  await rigaStaff().locator('input[type=checkbox]').check();
  await conti.getByLabel('Ore a tutti i presenti').fill('4,5');
  await conti.getByRole('button', { name: 'Applica' }).click();
  verifica(
    '"Ore a tutti" dà le ore a chi c’era',
    await attendi(async () => (await rigaStaff().locator('.casella-ore').inputValue()) === '4,5')
  );

  // Scrivere delle ore a chi non era spuntato lo segna presente.
  const altra = conti.locator('.tabella-presenze tbody tr').filter({ hasNotText: cognome }).first();
  const altraPresente = await altra.locator('input[type=checkbox]').isChecked();
  if (!altraPresente) {
    await altra.locator('.casella-ore').fill('2');
    await altra.locator('.casella-ore').press('Enter');
    verifica(
      'scrivendo delle ore la persona risulta presente',
      await attendi(async () => altra.locator('input[type=checkbox]').isChecked())
    );
  }
  await conti.screenshot({ path: RISULTATI + '/contabilita-staff.png', fullPage: true });

  // --- Il report per persona --------------------------------------------------
  await conti.getByRole('button', { name: 'Report' }).click();
  const rigaReport = conti.locator('.tabella-ore tbody tr', { hasText: cognome });
  verifica(
    'il Report mostra le ore staff della persona',
    await attendi(async () => (await rigaReport.count()) > 0 && /4,5/.test(await rigaReport.innerText())),
    (await rigaReport.count()) > 0 ? await rigaReport.innerText() : 'riga assente'
  );
  await conti.screenshot({ path: RISULTATI + '/contabilita-report-ore.png', fullPage: true });

  // --- Pulizia ----------------------------------------------------------------
  await conti.getByRole('button', { name: 'Presenze' }).click();
  await conti.getByRole('tab', { name: /Staff/ }).click();
  await conti.locator('.scelta-giornata select').selectOption(`${data}-smontaggio`);
  await conti.waitForTimeout(800);
  await conti.getByRole('button', { name: 'Elimina questa giornata' }).click();
  verifica(
    'la giornata si elimina',
    await attendi(async () => !(await conti.locator('.scelta-giornata select').innerText().catch(() => '')).includes(data.slice(8)) ||
      !(await conti.locator(`.scelta-giornata option[value="${data}-smontaggio"]`).count()))
  );

  await riga(admin).getByRole('button', { name: 'Elimina' }).click();
  verifica('la persona di prova si elimina', await attendi(async () => (await riga(admin).count()) === 0));

  await browser.close();
  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
