// Prova la tombola: tabellone di 90 caselle, estrazione con l'animazione,
// nessun numero ripetuto, partita che si ricorda dopo il ricaricamento.
//
//   cd prove && node prova-tombola.cjs
//
// Serve l'app Tombola accesa (npm run dev dentro apps/tombola, porta 5177).

const { chromium } = require('playwright');
const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const URL = 'http://127.0.0.1:5177/';
const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

(async () => {
  const browser = await chromium.launch();
  for (const tema of ['chiaro', 'scuro']) {
    const contesto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await contesto.addInitScript((t) => localStorage.setItem('tema', t), tema);
    const p = await contesto.newPage();
    p.on('pageerror', (e) => console.log('ERRORE PAGINA:', e.message));
    await p.goto(URL);

    if (tema === 'chiaro') {
      verifica('il tabellone ha 90 caselle', (await p.locator('.casella-numero').count()) === 90);
      verifica('all’inizio nessun numero è uscito', (await p.locator('.casella-numero.uscito').count()) === 0);
      verifica('la cornice è quella comune delle app', (await p.locator('header.barra-titolo').count()) === 1);
    }
    await p.screenshot({ path: path.join(RISULTATI, `tombola-${tema}-inizio.png`) });

    await p.getByRole('button', { name: 'Estrai numero' }).click();
    await p.waitForTimeout(900);
    if (tema === 'chiaro') {
      verifica('durante il giro la pallina si anima', (await p.locator('.pallina.giro').count()) === 1);
      verifica('durante il giro il tasto è bloccato', await p.getByRole('button', { name: 'Estraggo…' }).isDisabled());
    }
    await p.screenshot({ path: path.join(RISULTATI, `tombola-${tema}-giro.png`) });

    await p.locator('.pallina.uscito').waitFor({ timeout: 6000 });
    const testo = await p.locator('.annuncio').innerText();
    const numero = Number((testo.match(/\d+/) ?? [])[0]);
    verifica(`esce un numero da 1 a 90 (${tema})`, numero >= 1 && numero <= 90, testo);
    verifica('la pallina mostra quel numero', (await p.locator('.pallina .cifra').innerText()) === String(numero));
    verifica('sul tabellone si accende solo quel numero', (await p.locator('.casella-numero.uscito').count()) === 1 && (await p.locator('.casella-numero.nuovo').innerText()) === String(numero));
    await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(RISULTATI, `tombola-${tema}-uscito.png`) });

    if (tema === 'chiaro') {
      await p.reload();
      verifica('ricaricando la pagina la partita resta', (await p.locator('.casella-numero.uscito').count()) === 1);

      // Molte estrazioni: mai un numero ripetuto, fino a svuotare il sacchetto.
      await p.emulateMedia({ reducedMotion: 'reduce' });
      for (let i = 0; i < 89; i++) await p.getByRole('button', { name: 'Estrai numero' }).click();
      verifica('dopo 90 estrazioni sono usciti tutti i 90 numeri, senza ripetizioni', (await p.locator('.casella-numero.uscito').count()) === 90);
      verifica('finiti i numeri il tasto si ferma', await p.getByRole('button', { name: 'Estrai numero' }).isDisabled());

      await p.getByRole('button', { name: 'Nuova partita' }).click();
      await p.getByRole('button', { name: 'Sì, ricomincia' }).click();
      verifica('“Nuova partita” svuota il tabellone', (await p.locator('.casella-numero.uscito').count()) === 0);
    }
    await contesto.close();
  }
  await browser.close();
  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})();
