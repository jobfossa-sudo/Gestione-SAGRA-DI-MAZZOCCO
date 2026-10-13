// L'edizione, dal menù delle app: senza edizione l'amministratore trova il
// modulo per crearla (vera, con le serate spuntate sul calendario, o di
// prova) e gli altri un avviso; l'edizione di prova si vede in ogni app con
// la fascia a strisce, e nell'Archivio si azzera anche senza salvarla.
//
//   cd prove && node prova-edizione.cjs
//
// Serve il sistema locale acceso ("Avvia in locale.bat"). Se sul computer
// c'è già un'edizione, la mette da parte e la rimette identica alla fine.

const path = require('node:path');
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');
const { cancellaEdizioni, leggiEdizioni, mettiDaParteEdizioni, rimettiEdizioni } = require('./edizioni-da-parte.cjs');

const PORTALE = 'http://127.0.0.1:5170/';
const ANNO = String(new Date().getFullYear());

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ ok: !!condizione });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

async function attendi(condizione, tentativi = 40, pausa = 250) {
  for (let i = 0; i < tentativi; i++) {
    if (await condizione().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, pausa));
  }
  return false;
}

async function entra(browser, utente, indirizzo = PORTALE) {
  const pagina = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  pagina.on('pageerror', (e) => console.log(`[${utente}] ERRORE PAGINA:`, e.message));
  await pagina.goto(indirizzo);
  await pagina.getByLabel('Nome utente').fill(utente);
  await pagina.getByLabel('Password').fill('prova1234');
  await pagina.getByRole('button', { name: 'Entra', exact: true }).click();
  await pagina.waitForTimeout(2000);
  return pagina;
}

/** Un giorno del mese mostrato sul calendario. */
const giorno = (pagina, numero) => pagina.locator('.griglia-calendario .giorno', { hasText: new RegExp(`^${numero}$`) });

(async () => {
  const messe = await mettiDaParteEdizioni();
  const browser = await chromium.launch();
  try {
    // --- Senza edizione ----------------------------------------------------------
    const cassa = await entra(browser, 'cassa');
    verifica(
      'chi non è amministratore vede l’avviso che manca l’edizione',
      await cassa.locator('.avviso-edizione').isVisible() &&
        /nessuna edizione aperta/i.test(await cassa.locator('.avviso-edizione').innerText())
    );
    verifica('ma non il modulo per crearla', (await cassa.locator('.modulo-edizione').count()) === 0);
    verifica('e sotto i riquadri delle app ci sono sempre', await cassa.getByText('Scegli dove entrare').isVisible());

    const admin = await entra(browser, 'admin');
    verifica('l’amministratore trova il modulo per crearla', await admin.locator('.modulo-edizione').isVisible());
    const crea = admin.getByRole('button', { name: /Crea l’edizione/ });
    verifica('il nome si propone da solo', (await admin.getByLabel('Nome').inputValue()) === `Sagra di Mazzocco ${ANNO}`);
    verifica('senza serate spuntate non si crea', await crea.isDisabled());
    verifica('e dice cosa manca', /Spunta sul calendario/.test(await admin.locator('.tasti-edizione').innerText()));
    verifica('il calendario ha sette colonne, da lunedì', (await admin.locator('.giorno-settimana').allInnerTexts()).join('') === 'LMMGVSD');
    await admin.screenshot({ path: RISULTATI + '/edizione-modulo.png', fullPage: true });

    // --- L'edizione di prova -------------------------------------------------------
    await admin.locator('.tipo-edizione label', { hasText: 'Di prova' }).click();
    verifica('scelta la prova, il nome cambia', (await admin.getByLabel('Nome').inputValue()) === `Prova ${ANNO}`);
    verifica('e si crea anche senza serate', await crea.isEnabled());
    verifica('il modulo mostra le strisce della prova', (await admin.locator('.modulo-edizione.di-prova').count()) === 1);
    await crea.click();
    verifica(
      'creata, in cima compare l’edizione di prova',
      await attendi(async () => /Edizione di prova/i.test(await admin.locator('.scheda-edizione').innerText()))
    );
    verifica('con il suo nome', (await admin.locator('.scheda-edizione h2').innerText()) === `Prova ${ANNO}`);
    verifica('e le strisce', (await admin.locator('.scheda-edizione.di-prova').count()) === 1);
    verifica(
      'anche chi non è amministratore la vede, senza il tasto per cambiarla',
      await attendi(async () => (await cassa.locator('.scheda-edizione.di-prova').count()) === 1) &&
        (await cassa.getByRole('button', { name: /Modifica le serate/ }).count()) === 0
    );
    await admin.screenshot({ path: RISULTATI + '/edizione-prova.png', fullPage: true });

    for (const [app, porta] of [
      ['Comande', 5173],
      ['Contabilità', 5175],
      ['Utenti', 5174],
    ]) {
      const pagina = await entra(browser, 'admin', `http://127.0.0.1:${porta}/`);
      verifica(
        `${app}: in cima c’è la fascia "Edizione di prova"`,
        await attendi(async () => /Edizione di prova/i.test(await pagina.locator('.fascia-prova').innerText()))
      );
      if (app === 'Utenti') {
        await pagina.getByRole('button', { name: 'Archivio' }).click();
        verifica(
          'nell’Archivio l’edizione è segnata come di prova',
          await attendi(async () => (await pagina.locator('.scelta-anno option', { hasText: `${ANNO} · di prova` }).count()) === 1)
        );
        await pagina.locator('.scelta-anno select').selectOption(ANNO);
        verifica('e si può azzerare senza salvarla', await pagina.getByLabel('Frase di conferma').isEnabled());
        verifica('lo spiega', /anche senza salvarla/.test(await pagina.locator('.passo-pericoloso').innerText()));
        await pagina.screenshot({ path: RISULTATI + '/edizione-archivio-prova.png', fullPage: true });
      }
      await pagina.screenshot({ path: RISULTATI + `/edizione-fascia-${porta}.png` });
      await pagina.close();
    }

    // La prova si toglie a mano, solo il suo documento: azzerarla dall'Archivio
    // cancellerebbe anche le serate di quest'anno che ci sono sul computer.
    await cancellaEdizioni();
    verifica('tolta l’edizione, torna il modulo', await attendi(async () => admin.locator('.modulo-edizione').isVisible()));

    // --- L'edizione vera, con le serate spuntate -------------------------------
    verifica('il modulo riparte da "Vera"', await admin.locator('.tipo-edizione label.scelto', { hasText: 'Vera' }).isVisible());
    await giorno(admin, 20).click();
    await giorno(admin, 21).click();
    await giorno(admin, 22).click();
    await giorno(admin, 22).click();
    verifica('i giorni toccati si spuntano, e ritoccati si tolgono', (await admin.locator('.giorno.spuntato').count()) === 2);
    verifica('sopra si leggono le serate scelte', /2 serate:/.test(await admin.locator('.serate-scelte').innerText()));
    await crea.click();
    verifica(
      'creata, in cima c’è l’edizione in corso',
      await attendi(async () => /Edizione in corso/i.test(await admin.locator('.scheda-edizione').innerText()))
    );
    verifica('senza strisce', (await admin.locator('.scheda-edizione.di-prova').count()) === 0);
    verifica('con le sue due serate', /2 serate/.test(await admin.locator('.periodo-edizione').innerText()));
    const vera = (await leggiEdizioni())[0];
    const serateVere = (vera?.fields?.serate?.arrayValue?.values ?? []).map((v) => v.stringValue);
    verifica(
      'nell’archivio ci sono proprio i giorni spuntati',
      serateVere.length === 2 && serateVere.every((d) => d.startsWith(`${ANNO}-`)) && /-20$/.test(serateVere[0]) && /-21$/.test(serateVere[1]),
      serateVere.join(', ')
    );
    await admin.screenshot({ path: RISULTATI + '/edizione-vera.png', fullPage: true });

    // Si cambiano le serate.
    await admin.getByRole('button', { name: /Modifica le serate/ }).click();
    verifica('"Modifica le serate" riapre il modulo con le serate già spuntate', (await admin.locator('.giorno.spuntato').count()) === 2);
    verifica('il tipo non si cambia più', (await admin.locator('.tipo-edizione').count()) === 0 && /Edizione vera/.test(await admin.locator('.tipo-fisso').innerText()));
    await giorno(admin, 21).click();
    await admin.getByRole('button', { name: 'Salva le modifiche' }).click();
    verifica(
      'salvate le modifiche, resta una serata',
      await attendi(async () => /1 serata/.test(await admin.locator('.periodo-edizione').innerText()))
    );

    // Le serate restano dell'anno dell'edizione.
    await admin.getByRole('button', { name: /Modifica le serate/ }).click();
    for (let i = new Date().getMonth(); i < 12; i++) await admin.getByRole('button', { name: 'Mese dopo' }).click();
    await giorno(admin, 5).click();
    verifica(
      'una serata dell’anno dopo non si accetta',
      /devono essere del/.test(await admin.locator('.modulo-edizione .errore').innerText()) &&
        (await admin.getByRole('button', { name: 'Salva le modifiche' }).isDisabled())
    );
    await admin.getByRole('button', { name: 'Annulla' }).click();
    verifica('"Annulla" lascia l’edizione com’era', /1 serata/.test(await admin.locator('.periodo-edizione').innerText()));

    const comande = await entra(browser, 'cassa', 'http://127.0.0.1:5173/');
    verifica('con l’edizione vera, in Comande niente fascia', (await comande.locator('.fascia-prova').count()) === 0);

    // Al telefono: il modulo sta in una colonna e non esce dallo schermo.
    await cancellaEdizioni();
    await admin.setViewportSize({ width: 390, height: 844 });
    await attendi(async () => admin.locator('.modulo-edizione').isVisible());
    const largo = await admin.evaluate(() => document.documentElement.scrollWidth);
    verifica('al telefono il modulo non esce dallo schermo', largo <= 390, `${largo} px`);
    await admin.screenshot({ path: RISULTATI + '/edizione-telefono.png', fullPage: true });
  } finally {
    await browser.close();
    await rimettiEdizioni(messe);
  }

  const passati = esiti.filter((e) => e.ok).length;
  console.log(`\n${passati}/${esiti.length} controlli passati.`);
  process.exit(passati === esiti.length ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
