// I banchi BAR e BEVANDE: il menù che si gestiscono da soli, la cassa che
// incassa e stampa, l'archivio della serata, e — solo a BEVANDE — le comande
// del bere che arrivano dalla cassa dei tavoli.
//
//   cd prove && node prova-banchi.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat").

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');

const URL = 'http://127.0.0.1:5173/';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

const senzaTag = (html) => html.replace(/<[^>]+>/g, ' ');

async function entra(browser, utente) {
  const pagina = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  // window.print() non fa nulla in un browser senza schermo: lo sostituisco per
  // catturare il foglio che sarebbe finito sulla carta.
  await pagina.addInitScript(() => {
    window.__stampe = [];
    window.print = () => {
      const area = document.querySelector('.area-stampa');
      window.__stampe.push(area ? area.innerHTML : '(nessuna area di stampa)');
    };
  });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  pagina.on('dialog', (d) => d.accept());
  await pagina.goto(URL);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(3000);
  return pagina;
}

/** Aspetta che una condizione diventi vera invece di fidarsi di un'attesa a
 * occhio: quanto ci mette il server dipende da quanto è carica la serata. */
async function attendi(condizione, tentativi = 30, pausa = 500) {
  for (let i = 0; i < tentativi; i++) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return false;
}

(async () => {
  const browser = await chromium.launch();

  // --- Il banco BAR: chi entra vede solo il suo -----------------------------
  const bar = await entra(browser, 'bancobar');
  const linguette = await bar.locator('header nav button').allInnerTexts();
  verifica('chi sta al banco BAR entra nella finestra BAR', /BAR/.test(await bar.innerText('body')));
  verifica(
    'e non vede la finestra dell’altro banco',
    !linguette.some((t) => /BEVANDE/.test(t)),
    linguette.join(' | ') || 'nessuna linguetta'
  );

  const schede = await bar.locator('.sotto-schede button').allInnerTexts();
  verifica(
    'la finestra ha le tre schede: Gestione Menù, Cassa, Ordini',
    schede.length === 3 &&
      /Gestione Menù/.test(schede[0]) &&
      /Cassa/.test(schede[1]) &&
      /Ordini/.test(schede[2]),
    schede.join(' | ')
  );
  verifica('si apre sulla cassa, dove si lavora', /attiva/.test(await bar.locator('.sotto-schede button').nth(1).getAttribute('class')));
  verifica('e dice a quale banco si è', /Banco BAR/.test(await bar.innerText('.targhetta-banco')));

  // --- Gestione Menù: se lo fa il barista, senza l'amministratore -----------
  await bar.getByRole('button', { name: 'Gestione Menù' }).click();
  await bar.waitForTimeout(1500);
  verifica(
    'il menù del banco è già suo',
    (await bar.getByLabel('Nome del gruppo Birre').count()) === 1 &&
      (await bar.getByLabel('Nome di Birra piccola').count()) === 1
  );
  verifica('e non è il menù della sagra', (await bar.getByLabel('Nome di Pasta al ragù').count()) === 0);

  const suffisso = Date.now().toString().slice(-5);
  const nomeGruppo = 'Prova ' + suffisso;
  const nomeVoce = 'Spritz ' + suffisso;
  await bar.getByLabel('Nome del nuovo gruppo').fill(nomeGruppo);
  await bar.getByRole('button', { name: 'Crea gruppo' }).click();
  verifica(
    'il barista crea un gruppo nuovo',
    await attendi(async () => (await bar.getByLabel(`Nome del gruppo ${nomeGruppo}`).count()) === 1)
  );

  // Il corpo di tabella che contiene proprio quel gruppo, non un altro.
  const gruppoNuovo = bar
    .locator('tbody')
    .filter({ has: bar.getByLabel(`Nome del gruppo ${nomeGruppo}`) });
  const nuovaVoce = gruppoNuovo.locator('.riga-nuovo');
  await nuovaVoce.getByLabel('Nome della nuova voce').fill(nomeVoce);
  await nuovaVoce.getByLabel('Prezzo della nuova voce').fill('4,50');
  await nuovaVoce.getByRole('button', { name: 'Aggiungi' }).click();
  verifica(
    'e ci aggiunge una voce con il suo prezzo',
    await attendi(async () => (await bar.getByLabel(`Nome di ${nomeVoce}`).count()) === 1)
  );
  verifica(
    'col prezzo che ha scritto',
    (await bar.getByLabel(`Prezzo di ${nomeVoce}`).inputValue()) === '4,50 €',
    await bar.getByLabel(`Prezzo di ${nomeVoce}`).inputValue()
  );

  // --- La cassa del banco: si batte, si incassa, esce lo scontrino ----------
  await bar.getByRole('button', { name: 'Cassa', exact: true }).click();
  await bar.waitForTimeout(1500);
  verifica('la voce appena creata è già in vendita', (await bar.innerText('.colonna-comanda')).includes(nomeVoce));

  await bar.getByRole('button', { name: 'Aggiungi Birra piccola' }).click();
  await bar.getByRole('button', { name: 'Aggiungi Birra piccola' }).click();
  await bar.getByRole('button', { name: 'Aggiungi Caffè' }).click();
  await bar.waitForTimeout(800);
  const scontrino = await bar.innerText('.resoconto-cliente');
  verifica('il conto si compone mentre si batte', /Birra piccola/.test(scontrino) && /Caffè/.test(scontrino));
  verifica('il totale è giusto (2 birre + 1 caffè)', /7,20/.test(scontrino), scontrino.replace(/\n/g, ' ').slice(-40));
  verifica(
    'lo scontrino del banco non chiede tavolo e coperti',
    (await bar.locator('.targhette-resoconto').count()) === 0
  );
  await bar.screenshot({ path: RISULTATI + '/banco-bar-cassa.png' });

  await bar.getByRole('button', { name: 'Incassa e stampa' }).click();
  verifica(
    'l’incasso stampa lo scontrino',
    await attendi(async () => (await bar.evaluate(() => window.__stampe.length)) > 0)
  );
  const foglio = senzaTag((await bar.evaluate(() => window.__stampe))[0] || '');
  const codice = (foglio.match(/BAR\d{4}/) || [])[0];
  verifica('il foglio porta il numero del banco', !!codice, codice ?? 'nessuno');
  verifica('e le voci col totale', /Birra piccola/.test(foglio) && /7,20/.test(foglio), foglio.trim().slice(0, 60));
  verifica(
    'il banco torna libero per il cliente dopo',
    await attendi(async () => /TOTALE\s+0,00/.test(await bar.innerText('.totale-resoconto')))
  );

  // --- L'archivio: si guarda, si ristampa, si annulla -----------------------
  await bar.getByRole('button', { name: 'Ordini', exact: true }).click();
  await bar.waitForTimeout(1500);
  verifica(
    'lo scontrino appena battuto è in archivio',
    await attendi(async () => (await bar.innerText('.riepilogo-ordini')).includes(codice)),
    codice
  );
  const riga = bar.locator('.riga-riepilogo', { hasText: codice }).first();
  await riga.getByRole('button', { name: 'Vedi' }).click();
  await bar.waitForTimeout(400);
  verifica('si apre sulle sue voci', (await riga.locator('.voci-riepilogo li').count()) > 0);

  await riga.getByRole('button', { name: 'Ristampa' }).click();
  verifica(
    'e si ristampa lo scontrino perso',
    await attendi(async () => (await bar.evaluate(() => window.__stampe.length)) === 2)
  );

  const incassoPrima = await bar.innerText('.totale-archivio');
  await riga.getByRole('button', { name: 'Annulla' }).click();
  verifica(
    'un incasso sbagliato si annulla',
    await attendi(async () => /annullato/i.test(await riga.innerText()))
  );
  verifica('ma resta in elenco', (await bar.locator('.riga-riepilogo', { hasText: codice }).count()) > 0);
  const incassoDopo = await bar.innerText('.totale-archivio');
  verifica('ed esce dall’incasso del banco', incassoPrima !== incassoDopo, `${incassoPrima} → ${incassoDopo}`);
  await bar.screenshot({ path: RISULTATI + '/banco-bar-ordini.png', fullPage: true });

  // Un secondo scontrino, che resta buono: serve ai conti di fine serata.
  await bar.getByRole('button', { name: 'Cassa', exact: true }).click();
  await bar.waitForTimeout(1200);
  await bar.getByRole('button', { name: 'Aggiungi Birra grande' }).click();
  await bar.getByRole('button', { name: 'Incassa e stampa' }).click();
  await bar.waitForTimeout(2500);

  // --- Il banco BEVANDE: uguale, più le comande dalla cassa -----------------
  const bevande = await entra(browser, 'bancobevande');
  const schedeBevande = await bevande.locator('.sotto-schede button').allInnerTexts();
  verifica(
    'il banco BEVANDE ha una scheda in più: le comande dalla cassa',
    schedeBevande.length === 4 && schedeBevande.some((t) => /Comande dalla cassa/.test(t)),
    schedeBevande.join(' | ')
  );
  verifica('e il suo menù è diverso da quello del BAR', /Vino/.test(await bevande.innerText('.colonna-comanda')));

  await bevande.getByRole('button', { name: 'Aggiungi Vino al bicchiere' }).click();
  await bevande.getByRole('button', { name: 'Incassa e stampa' }).click();
  verifica(
    'anche BEVANDE incassa e stampa',
    await attendi(async () => (await bevande.evaluate(() => window.__stampe.length)) > 0)
  );
  const foglioBev = senzaTag((await bevande.evaluate(() => window.__stampe))[0] || '');
  verifica(
    'con la sua numerazione, separata da quella del BAR',
    /BEV\d{4}/.test(foglioBev),
    (foglioBev.match(/BEV\d{4}/) || ['nessuno'])[0]
  );

  // La cassa dei tavoli batte un ordine col bere: la sua parte da bere deve
  // arrivare qui, da sola.
  await bevande.getByRole('button', { name: 'Comande dalla cassa' }).click();
  await bevande.waitForTimeout(1200);
  const comandePrima = await bevande.locator('.elenco-comande .riga-riepilogo').count();

  const cassa = await entra(browser, 'cassa');
  await cassa.getByLabel('Tavolo').fill('9');
  await cassa.getByLabel('Coperti').fill('2');
  await cassa.getByRole('button', { name: 'Aggiungi Birra' }).click();
  await cassa.getByRole('button', { name: 'Aggiungi Birra' }).click();
  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  await cassa.waitForTimeout(4000);
  const foglioCassa = senzaTag((await cassa.evaluate(() => window.__stampe)).slice(-1)[0] || '');
  const codiceOrdine = (foglioCassa.match(/[A-Z]\d{4}/) || [])[0];
  verifica('la cassa dei tavoli batte un ordine col bere', !!codiceOrdine, codiceOrdine ?? 'nessuno');

  verifica(
    'la comanda del bere arriva al banco BEVANDE da sola',
    await attendi(async () => (await bevande.locator('.elenco-comande .riga-riepilogo').count()) > comandePrima, 40),
    `prima ${comandePrima}`
  );
  // La comanda da controllare è quella dell'ordine appena battuto, non la
  // prima dell'elenco: al banco ne restano anche di vecchie, e l'elenco parte
  // dalle più vecchie perché si lavora in ordine di arrivo.
  const comanda = bevande.locator('.elenco-comande .riga-riepilogo', { hasText: codiceOrdine }).first();
  verifica(
    'porta il numero dell’ordine del cliente',
    (await comanda.count()) === 1,
    `cercata la comanda di ${codiceOrdine}`
  );
  const testoComanda = (await comanda.count()) === 1 ? await comanda.innerText() : '';
  verifica('e solo il bere, non il cibo', /Birra/.test(testoComanda) && !/Pasta/.test(testoComanda));
  // Il foglio esce da solo, ma a stamparlo è UNO SOLO degli schermi accesi: se
  // ce n'è un altro aperto su questa scheda (anche il browser di chi sta
  // guardando) può prenderselo lui. Quello che si controlla è che la comanda
  // risulti stampata, non che sia stata questa pagina a farlo.
  verifica(
    'il foglio esce da solo, senza premere niente',
    await attendi(async () => /stampata/i.test(await comanda.innerText()), 40)
  );
  await bevande.screenshot({ path: RISULTATI + '/banco-bevande-comande.png', fullPage: true });

  // Un secondo schermo dello stesso banco non deve far uscire un doppione.
  const bevande2 = await entra(browser, 'bancobevande');
  await bevande2.getByRole('button', { name: 'Comande dalla cassa' }).click();
  await bevande2.waitForTimeout(3000);
  verifica(
    'un secondo schermo non stampa un doppione',
    (await bevande2.evaluate(() => window.__stampe.length)) === 0
  );

  await comanda.getByRole('button', { name: 'Pronta' }).click();
  verifica(
    'la comanda si segna pronta',
    await attendi(async () => /Pronta/.test(await comanda.innerText()))
  );

  // --- Fine serata: gli incassi dei banchi entrano nel totale ---------------
  const admin = await entra(browser, 'admin');
  await admin.getByRole('button', { name: 'Cassa', exact: true }).click();
  await admin.waitForTimeout(1200);
  await admin.getByRole('button', { name: 'Fine serata' }).click();
  await admin.waitForTimeout(2500);
  const fine = await admin.innerText('.fine-serata');
  verifica('in Fine serata c’è il quadrato dell’incasso BAR', /Incasso BAR/.test(fine));
  verifica('e quello dell’incasso BEVANDE', /Incasso BEVANDE/.test(fine));

  const cifra = (testo) => Number((testo || '0').replace(/[^\d,]/g, '').replace(',', '.'));
  const incassoBar = cifra((fine.match(/Incasso BAR\s+([\d.,]+)/) || [])[1]);
  const incassoBev = cifra((fine.match(/Incasso BEVANDE\s+([\d.,]+)/) || [])[1]);
  const incassiCasse = [...fine.matchAll(/Incasso cassa [A-Z]\s+([\d.,]+)/g)].map((m) => cifra(m[1]));
  const totale = cifra((fine.match(/Incasso totale\s+([\d.,]+)/) || [])[1]);
  verifica('il BAR ha incassato qualcosa', incassoBar > 0, incassoBar.toFixed(2));
  verifica('e BEVANDE pure', incassoBev > 0, incassoBev.toFixed(2));
  verifica(
    'il totale della serata comprende casse e banchi',
    Math.abs(incassiCasse.reduce((s, n) => s + n, 0) + incassoBar + incassoBev - totale) < 0.005,
    `casse ${incassiCasse.reduce((s, n) => s + n, 0).toFixed(2)} + BAR ${incassoBar.toFixed(2)} + BEVANDE ${incassoBev.toFixed(2)} = ${totale.toFixed(2)}`
  );
  await admin.screenshot({ path: RISULTATI + '/banchi-fine-serata.png', fullPage: true });

  // --- L'amministratore entra dappertutto, anche ai banchi ------------------
  const linguetteAdmin = await admin.locator('header nav button').allInnerTexts();
  verifica(
    'l’amministratore vede tutte e due le finestre dei banchi',
    linguetteAdmin.some((t) => /^BAR$/.test(t.trim())) && linguetteAdmin.some((t) => /^BEVANDE$/.test(t.trim())),
    linguetteAdmin.join(' | ')
  );


  // --- La prova si porta via quello che ha creato --------------------------
  // Senza questo, a ogni giro il menù del banco si riempirebbe di gruppi
  // "Prova" e di Spritz, e la volta dopo i controlli non tornerebbero.
  await bar.getByRole('button', { name: 'Gestione Menù' }).click();
  await bar.waitForTimeout(1500);
  const gruppoDaTogliere = bar
    .locator('tbody')
    .filter({ has: bar.getByLabel(`Nome del gruppo ${nomeGruppo}`) });
  await gruppoDaTogliere.locator('tr', { has: bar.getByLabel(`Nome di ${nomeVoce}`) }).getByRole('button', { name: 'Elimina' }).click();
  const voceTolta = await attendi(async () => (await bar.getByLabel(`Nome di ${nomeVoce}`).count()) === 0);
  await gruppoDaTogliere.getByRole('button', { name: 'Elimina gruppo' }).click();
  const gruppoTolto = await attendi(async () => (await bar.getByLabel(`Nome del gruppo ${nomeGruppo}`).count()) === 0);
  verifica('una voce e un gruppo si eliminano dal menù del banco', voceTolta && gruppoTolto);
  await browser.close();

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
