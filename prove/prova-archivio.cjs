// L'archivio delle edizioni, nell'app Utenti: si scarica il file, si azzera
// l'edizione, si ricarica il file e i conti tornano uguali.
//
//   cd prove && node prova-archivio.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat"). Lavora su un anno
// finto (2032), che prepara da sé e cancella alla fine: i dati veri dell'anno
// non si toccano.

const path = require('node:path');
const fs = require('node:fs');
const RISULTATI = path.join(__dirname, 'risultati');
fs.mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');
// Le stesse librerie che usa l'app, per aprire il file scaricato.
const JSZip = require('../apps/utenti/node_modules/jszip');
const ExcelJS = require('../apps/utenti/node_modules/exceljs');

const UTENTI = 'http://127.0.0.1:5174/';
const ANNO = '2032';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/gestione-sagra-mazzocco/databases/(default)/documents';

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

async function attendi(condizione, tentativi = 60, pausa = 500) {
  for (let i = 0; i < tentativi; i++) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return false;
}

/** Scrive un documento direttamente nell'emulatore, scavalcando le regole
 * ("Bearer owner"): gli ordini dal browser non si possono creare a mano. */
async function scrivi(percorso, campi) {
  const fields = {};
  for (const [k, v] of Object.entries(campi)) {
    if (typeof v === 'number') fields[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    else if (v instanceof Date) fields[k] = { timestampValue: v.toISOString() };
    else if (Array.isArray(v)) {
      fields[k] = {
        arrayValue: {
          values: v.map((voce) => ({
            mapValue: {
              fields: Object.fromEntries(
                Object.entries(voce).map(([kk, vv]) => [kk, typeof vv === 'number' ? { doubleValue: vv } : { stringValue: vv }])
              ),
            },
          })),
        },
      };
    } else fields[k] = { stringValue: String(v) };
  }
  const risposta = await fetch(`${FIRESTORE}/${percorso}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!risposta.ok) throw new Error(`Scrittura di ${percorso}: ${risposta.status} ${await risposta.text()}`);
}

async function prepara() {
  const quando = new Date(Date.UTC(2032, 6, 1, 18, 30));
  const serata = `${ANNO}-07-01`;
  await scrivi(`serate/${serata}`, { id: serata, data: serata });
  await scrivi(`serate/${serata}/ordini/o1`, {
    id: 'o1', serataId: serata, codice: 'A0001', stato: 'completata', tipo: 'cassa', pagamento: 'contanti',
    tavolo: 3, coperti: 2, totale: 17, createdAt: quando,
    items: [{ nome: 'Pasta al ragù', quantita: 1, prezzo: 7 }, { nome: 'Grigliata mista', quantita: 1, prezzo: 10 }],
  });
  await scrivi(`serate/${serata}/ordini/o2`, {
    id: 'o2', serataId: serata, codice: 'A0002', stato: 'in_evasione', tipo: 'cassa', pagamento: 'elettronico',
    tavolo: 5, coperti: 1, totale: 3, createdAt: quando,
    items: [{ nome: 'Birra', quantita: 1, prezzo: 3 }],
  });
  await scrivi(`edizioni/${ANNO}/uscite/u1`, { id: 'u1', descrizione: 'Ghiaccio', fornitore: 'Bar Sport', importo: 40, data: serata, createdAt: quando });
}

async function entra(browser) {
  const pagina = await browser.newPage({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  pagina.on('pageerror', (e) => console.log('ERRORE PAGINA:', e.message));
  pagina.on('dialog', (d) => d.accept());
  // La finestra "Salva con nome" di Windows una prova automatica non la può
  // cliccare: si finge di averla, e il file "salvato" si tiene in pagina.
  await pagina.addInitScript(() => {
    window.showSaveFilePicker = async (opzioni) => ({
      createWritable: async () => ({
        write: async (blob) => {
          const byte = new Uint8Array(await blob.arrayBuffer());
          let binario = '';
          for (let i = 0; i < byte.length; i += 0x8000) binario += String.fromCharCode(...byte.subarray(i, i + 0x8000));
          window.__salvato = { nome: opzioni.suggestedName, base64: btoa(binario) };
        },
        close: async () => {},
      }),
    });
  });
  await pagina.goto(UTENTI);
  await pagina.getByLabel('Nome utente').fill('admin');
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra' }).click();
  await pagina.waitForTimeout(2500);
  return pagina;
}

/** La finestra della password: si scrive e si conferma. */
async function confermaPassword(pagina, password = 'prova1234') {
  await pagina.locator('.finestra-conferma').getByLabel('Password').fill(password);
  await pagina.locator('.finestra-conferma').getByRole('button', { name: 'Conferma' }).click();
}

async function scaricaArchivio(pagina) {
  await pagina.evaluate(() => (window.__salvato = null));
  await pagina.getByRole('button', { name: `Prepara l'archivio del ${ANNO}` }).click();
  await confermaPassword(pagina);
  await pagina.getByRole('button', { name: /Scegli dove salvarlo/ }).click({ timeout: 120_000 });
  await attendi(async () => !!(await pagina.evaluate(() => window.__salvato)));
  const salvato = await pagina.evaluate(() => window.__salvato);
  const file = path.join(RISULTATI, salvato.nome);
  fs.writeFileSync(file, Buffer.from(salvato.base64, 'base64'));
  return file;
}

async function azzera(pagina) {
  await pagina.getByLabel('Frase di conferma').fill(`AZZERA ${ANNO}`);
  await pagina.getByRole('button', { name: `Azzera il ${ANNO}` }).click();
  await confermaPassword(pagina);
  return attendi(async () => /azzerata/.test((await pagina.locator('.successo').textContent().catch(() => '')) ?? ''));
}

(async () => {
  await prepara();
  const browser = await chromium.launch();
  const pagina = await entra(browser);

  await pagina.getByRole('button', { name: 'Archivio' }).click();
  verifica(
    'la scheda Archivio elenca l’edizione 2032',
    await attendi(async () => (await pagina.locator('.scelta-anno option', { hasText: ANNO }).count()) > 0)
  );
  await pagina.locator('.scelta-anno select').selectOption(ANNO);
  const conteggi = await pagina.locator('.conteggi').first().innerText();
  verifica('con quanto c’è dentro', /1\s+serata/.test(conteggi) && /2\s+ordini dei tavoli/.test(conteggi) && /1\s+spesa/.test(conteggi), conteggi.replace(/\s+/g, ' '));
  verifica(
    'prima di scaricare, l’azzeramento è spento',
    await pagina.getByRole('button', { name: `Azzera il ${ANNO}` }).isDisabled()
  );

  // --- 1. Salva ---------------------------------------------------------------
  await pagina.getByRole('button', { name: `Prepara l'archivio del ${ANNO}` }).click();
  verifica('per salvare chiede la password dell’amministratore', await pagina.locator('.finestra-conferma').isVisible());
  verifica(
    'con il nome utente già scritto',
    (await pagina.locator('.finestra-conferma').getByLabel('Nome utente').inputValue()) === 'admin'
  );
  await confermaPassword(pagina, 'sbagliata1');
  verifica(
    'una password sbagliata viene rifiutata',
    await attendi(async () => /Password errata/.test((await pagina.locator('.finestra-conferma .errore').textContent().catch(() => '')) ?? ''))
  );
  await pagina.locator('.finestra-conferma').getByRole('button', { name: 'Annulla' }).click();
  verifica('e annullando non si prepara niente', (await pagina.getByRole('button', { name: /Scegli dove salvarlo/ }).count()) === 0);

  const file = await scaricaArchivio(pagina);
  verifica('si sceglie dove salvare, e si salva un file .zip', file.endsWith('.zip'), path.basename(file));
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  verifica(
    'dentro ci sono i dati completi, l’Excel e il LEGGIMI',
    !!zip.file('dati-completi.json') && !!zip.file(`sagra-mazzocco-${ANNO}.xlsx`) && !!zip.file('LEGGIMI.txt')
  );
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await zip.file(`sagra-mazzocco-${ANNO}.xlsx`).async('nodebuffer'));
  const nomiFogli = libro.worksheets.map((f) => f.name);
  verifica(
    'l’Excel ha un foglio per argomento',
    ['Serate', 'Ordini', 'Presenze', 'Spese', 'Entrate extra', 'Chiusure cassetti', 'Menù', 'Persone'].every((n) => nomiFogli.includes(n)),
    nomiFogli.join(', ')
  );
  const serate = libro.getWorksheet('Serate');
  const rigaSerata = serate.getRow(2).values;
  verifica('nel foglio Serate l’incasso è giusto (17 + 3 = 20)', rigaSerata[7] === 20, JSON.stringify(rigaSerata));
  verifica('diviso fra contanti (17) e POS (3)', rigaSerata[8] === 17 && rigaSerata[9] === 3);
  verifica('nel foglio Ordini c’è una riga per piatto', libro.getWorksheet('Ordini').rowCount === 1 + 3);
  verifica('l’ora dell’ordine è una data vera', libro.getWorksheet('Ordini').getRow(2).getCell(12).value instanceof Date);
  await pagina.screenshot({ path: RISULTATI + '/utenti-archivio.png', fullPage: true });

  // --- 2. Azzera ----------------------------------------------------------------
  verifica('dopo aver scaricato, l’azzeramento si accende', await pagina.getByLabel('Frase di conferma').isEnabled());
  await pagina.getByLabel('Frase di conferma').fill('azzera');
  verifica('con la frase sbagliata il tasto resta spento', await pagina.getByRole('button', { name: `Azzera il ${ANNO}` }).isDisabled());
  verifica('con la frase giusta l’edizione si azzera', await azzera(pagina));
  verifica(
    'e sparisce dall’elenco',
    await attendi(async () => (await pagina.locator('.scelta-anno option', { hasText: ANNO }).count()) === 0)
  );
  const vuoto = await fetch(`${FIRESTORE}/serate/${ANNO}-07-01/ordini`, { headers: { Authorization: 'Bearer owner' } }).then((r) => r.json());
  verifica('gli ordini del 2032 non ci sono più', !vuoto.documents || vuoto.documents.length === 0);

  // --- 3. Ricarica --------------------------------------------------------------
  await pagina.getByLabel("File dell'archivio").setInputFiles(file);
  verifica(
    'scelto il file, mostra cosa c’è dentro',
    await attendi(async () => /2032/.test((await pagina.locator('.anteprima-archivio').textContent().catch(() => '')) ?? ''))
  );
  await pagina.getByRole('button', { name: `Ricarica nel ${ANNO}` }).click();
  verifica('anche per ricaricare chiede la password', await pagina.locator('.finestra-conferma').isVisible());
  await confermaPassword(pagina);
  verifica(
    'l’archivio si ricarica',
    await attendi(async () => /ricaricata/.test((await pagina.locator('.successo').textContent().catch(() => '')) ?? ''))
  );
  await pagina.locator('.scelta-anno select').selectOption(ANNO);
  const dopo = await pagina.locator('.conteggi').first().innerText();
  verifica('e i conti tornano uguali a prima', dopo === conteggi, dopo.replace(/\s+/g, ' '));

  // Ricaricare sopra dati che ci sono già non si può.
  await pagina.getByLabel("File dell'archivio").setInputFiles(file);
  await pagina.getByRole('button', { name: `Ricarica nel ${ANNO}` }).click();
  await confermaPassword(pagina);
  verifica(
    'sopra un’edizione piena non si ricarica',
    await attendi(async () => /ci sono già dei dati/.test((await pagina.locator('.errore').last().textContent().catch(() => '')) ?? ''))
  );

  // --- Pulizia: si salva e si azzera di nuovo -------------------------------------
  const daButtare = await scaricaArchivio(pagina);
  verifica('pulizia: l’edizione finta si azzera di nuovo', await azzera(pagina));
  for (const f of [file, daButtare]) fs.rmSync(f, { force: true });

  await browser.close();
  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
