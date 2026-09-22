// Il giro della cassa nel browser vero: si batte un ordine, si stampa il
// conto, si incassa, e da lì l'ordine è già in cucina. Più i due riepiloghi e
// la fine serata.
//
// Vuole il sistema locale acceso ("Avvia in locale.bat").

const path = require('node:path');
// Dove finiscono schermate e fogli catturati durante la prova.
const RISULTATI = path.join(__dirname, 'risultati');
require('node:fs').mkdirSync(RISULTATI, { recursive: true });

const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'http://127.0.0.1:5173/';

async function entra(browser, utente, password = 'prova1234') {
  // Misura di un monitor da cassa, non quella di partenza di Playwright: a
  // 720 punti di altezza la colonna della comanda scorre, ed è giusto così,
  // ma non è lo schermo su cui si lavora davvero.
  const pagina = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
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

/** Un cliente che ordina dal tavolo col telefono: chiama la funzione del
 * server come farebbe il menù del QR, senza passare dall'interfaccia. */
async function ordineDalTelefono(pagina, nomeApp, dati) {
  return pagina.evaluate(
    async ({ nomeApp, dati }) => {
      const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import(
        'https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js'
      );
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js');
      const app = initializeApp({ projectId: 'gestione-sagra-mazzocco', apiKey: 'finta' }, nomeApp);
      const funzioni = getFunctions(app);
      connectFunctionsEmulator(funzioni, '127.0.0.1', 5001);
      const crea = httpsCallable(funzioni, 'creaOrdineBozza');
      const risposta = await crea({ serataId: new Date().toISOString().slice(0, 10), ...dati });
      return risposta.data;
    },
    { nomeApp, dati }
  );
}

const esiti = [];
function verifica(descrizione, condizione, extra = '') {
  esiti.push({ descrizione, ok: !!condizione, extra });
  console.log(`${condizione ? 'OK ' : 'NO '} ${descrizione}${extra ? ' — ' + extra : ''}`);
}

const senzaTag = (html) => html.replace(/<[^>]+>/g, ' ');

(async () => {
  const browser = await chromium.launch();
  const cassa = await entra(browser, 'cassa');
  cassa.on('dialog', (d) => d.accept());

  // Quanti ordini del banco ci sono già: serve più avanti a dimostrare che il
  // conto stampato prima dell'incasso non ne ha aggiunto nessuno.
  await cassa.getByRole('button', { name: 'Ordini cassa' }).click();
  await cassa.waitForTimeout(1800);
  const ordiniPrima = await cassa.locator('.riga-riepilogo').count();
  await cassa.getByRole('button', { name: 'Nuovo ordine', exact: true }).click();
  await cassa.waitForTimeout(1200);

  // --- Si batte l'ordine, e lo scontrino si compone mentre si batte --------
  await cassa.getByLabel('Tavolo').fill('12');
  await cassa.getByLabel('Coperti').fill('3');
  await cassa.getByRole('button', { name: 'Aggiungi Pasta al ragù' }).click();
  await cassa.getByRole('button', { name: 'Aggiungi Birra' }).click();
  await cassa.waitForTimeout(1200);

  const anteprima = await cassa.innerText('.anteprima-biglietto');
  verifica(
    'il biglietto si vede in anteprima mentre si batte l’ordine',
    /Pasta al ragù/.test(anteprima) && /Birra/.test(anteprima)
  );
  verifica(
    'l’anteprima è il foglio vero, non un disegno a parte',
    (await cassa.locator('.anteprima-biglietto .foglio-composto').count()) === 1
  );
  verifica(
    'prima della conferma il numero di comanda resta in bianco',
    !/[A-Z]\d{4}/.test(anteprima),
    (anteprima.match(/[A-Z]\d{4}/) || ['nessuno'])[0]
  );
  const testata = cassa.locator('.anteprima-biglietto .due-colonne').first();
  verifica(
    'sul biglietto tavolo e coperti stanno nell’intestazione, a destra',
    (await testata.locator('.colonna').last().locator('.blocco-tavolo').count()) === 1
  );
  const corpoTavolo = await cassa
    .locator('.anteprima-biglietto .blocco-tavolo')
    .evaluate((e) => Number(getComputedStyle(e).fontSize.replace('px', '')));
  verifica('e sono scritti più in grande del testo normale', corpoTavolo > 20, corpoTavolo + 'px');

  const scorrimento = await cassa.evaluate(() => {
    const finestra = document.querySelector('.tabella-scroll');
    const piede = document.querySelector('.piede-comanda').getBoundingClientRect();
    return {
      menuTuttoInVista: finestra.scrollHeight <= finestra.clientHeight + 1,
      // Se i piatti fossero di più, a scorrere dovrebbe essere questa finestra
      // e non la pagina: è lei ad avere lo scorrimento addosso.
      finestraScorrevole: ['auto', 'scroll'].includes(getComputedStyle(finestra).overflowY),
      paginaFerma: document.documentElement.scrollHeight <= window.innerHeight + 2,
      tastiInVista: Math.round(piede.bottom) <= window.innerHeight,
      intestazioneAttaccata:
        getComputedStyle(document.querySelector('.tabella-ordine thead th')).position === 'sticky',
    };
  });
  verifica('il menù della sagra ci sta tutto, senza scorrere', scorrimento.menuTuttoInVista);
  verifica('e con un menù più lungo scorrerebbe la sua finestra', scorrimento.finestraScorrevole);
  verifica('e la pagina non si allunga dietro di lui', scorrimento.paginaFerma);
  verifica('i tre tasti restano in vista senza scorrere', scorrimento.tastiInVista);
  verifica('l’intestazione della tabella resta in cima mentre si scorre', scorrimento.intestazioneAttaccata);
  await cassa.screenshot({ path: RISULTATI + '/cassa-nuovo-ordine.png' });

  // --- Il conto da far vedere al cliente: non registra niente --------------
  await cassa.getByRole('button', { name: 'Stampa resoconto' }).click();
  await cassa.waitForTimeout(1000);
  const preconto = senzaTag((await cassa.evaluate(() => window.__stampe))[0] || '');
  verifica('il tasto stampa il conto per il cliente', /Pasta al ragù/.test(preconto) && /10,00/.test(preconto));
  verifica('il conto non ha numero di comanda: l’ordine non esiste ancora', !/[A-Z]\d{4}/.test(preconto));
  verifica(
    'né codice a barre',
    !/codice-a-barre/.test((await cassa.evaluate(() => window.__stampe))[0] || '')
  );

  // --- Prima dell'incasso i reparti non vedono niente ----------------------
  const cucina = await entra(browser, 'cucina');
  const quantoInCucina = async (voce) => {
    const testo = await cucina.innerText('.pannello-unico');
    const trovato = new RegExp(voce + '\\s+(\\d+)').exec(testo);
    return trovato ? Number(trovato[1]) : null;
  };
  const pastaPrima = await quantoInCucina('Pasta al ragù');

  // --- Conferma: incassa, manda ai reparti e stampa il definitivo ----------
  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  // Si aspetta che il secondo foglio esca davvero: la conferma fa un giro dal
  // server, e quanto ci metta dipende da quanto è carica la serata di prova.
  await cassa
    .waitForFunction(() => window.__stampe.length >= 2, undefined, { timeout: 40000 })
    .catch(() => {});
  const stampe = await cassa.evaluate(() => window.__stampe);
  verifica('la conferma stampa il foglio definitivo', stampe.length === 2, `fogli: ${stampe.length}`);
  const definitivo = stampe[1] || '';
  const codice = (senzaTag(definitivo).match(/[A-Z]\d{4}/) || [])[0];
  verifica('il foglio definitivo porta il numero di comanda', !!codice, codice);
  verifica('e il codice a barre disegnato', /<svg[^>]*codice-a-barre[\s\S]*<rect/.test(definitivo));
  verifica('sotto il codice c’è la riga leggibile', /· Cassa A/.test(senzaTag(definitivo)));
  verifica('il foglio riporta tavolo e coperti', /blocco-tavolo[\s\S]*12/.test(definitivo) && /3 coperti/.test(definitivo));
  fs.writeFileSync(RISULTATI + '/foglio-resoconto.html', definitivo);

  const dopoConferma = await cassa.innerText('.piede-comanda');
  verifica('la cassa dice che è partito', /incassato e inviato ai reparti/.test(dopoConferma), dopoConferma.slice(0, 90));
  verifica(
    'e il banco torna vuoto, pronto per il prossimo cliente',
    (await cassa.getByLabel('Tavolo').inputValue()) === '' &&
      (await cassa.getByRole('button', { name: 'Aggiungi Pasta al ragù' }).isEnabled()) &&
      /TOTALE\s+0,00/.test(dopoConferma)
  );

  await cucina.waitForTimeout(2500);
  const pastaDopo = await quantoInCucina('Pasta al ragù');
  verifica(
    'la pasta arriva in cucina subito, senza un secondo passaggio',
    pastaDopo === pastaPrima + 1,
    `prima ${pastaPrima}, dopo ${pastaDopo}`
  );

  // --- Ordine dal telefono: si richiama dal banco, senza cambiare schermata -
  const bozza = await ordineDalTelefono(cassa, 'cliente-qr', {
    tavolo: 7,
    coperti: 2,
    items: [{ prodottoId: 'gnocchi', quantita: 2 }],
  });
  verifica('un cliente dal QR manda il suo ordine', !!bozza.numero, 'numero ' + bozza.numero);

  await cassa.getByLabel('Ordine dal QR n.').fill(String(bozza.numero));
  // L'ordine appena partito dal telefono arriva al banco da solo, ma ci mette
  // il tempo che ci mette: con l'archivio pieno, più che con l'archivio vuoto.
  // Si ritenta finché non c'è, invece di fidarsi di un'attesa a occhio. In
  // cassa lo stesso lo rifarebbe la cassiera, premendo Richiama un'altra volta.
  let inMano = false;
  for (let tentativo = 0; tentativo < 40 && !inMano; tentativo++) {
    await cassa.getByRole('button', { name: 'Richiama' }).click();
    await cassa.waitForTimeout(1000);
    inMano = await cassa.locator('.avviso-dal-tavolo').isVisible().catch(() => false);
  }
  verifica(
    'l’ordine del cliente viene in mano alla cassa',
    inMano && /arrivato dal tavolo 7/.test(await cassa.innerText('.colonna-comanda'))
  );
  verifica(
    'tavolo e coperti arrivano da lui, non si ridigitano',
    (await cassa.getByLabel('Tavolo').inputValue()) === '7' &&
      (await cassa.getByLabel('Coperti').inputValue()) === '2'
  );
  verifica(
    'le sue voci compaiono sullo scontrino',
    /Gnocchi/.test(await cassa.innerText('.anteprima-biglietto'))
  );
  verifica(
    'e non si possono cambiare: le ha scelte il cliente',
    await cassa.getByRole('button', { name: 'Aggiungi Gnocchi al pomodoro' }).isDisabled()
  );

  await cassa.getByRole('button', { name: 'Conferma ordine' }).click();
  await cassa.waitForTimeout(4000);
  const stampeQr = await cassa.evaluate(() => window.__stampe);
  verifica('anche l’ordine dal telefono stampa il suo foglio', stampeQr.length === 3, `fogli: ${stampeQr.length}`);
  const codiceQr = (senzaTag(stampeQr[2] || '').match(/[A-Z]\d{4}/) || [])[0];
  verifica('e prende il numero di comanda della cassa', /^A\d{4}$/.test(codiceQr || ''), codiceQr);
  verifica('il banco si libera anche stavolta', (await cassa.getByLabel('Tavolo').inputValue()) === '');

  const numeroGiaPassato = bozza.numero;
  await cassa.getByLabel('Ordine dal QR n.').fill(String(numeroGiaPassato));
  await cassa.getByRole('button', { name: 'Richiama' }).click();
  await cassa.waitForTimeout(1000);
  verifica(
    'lo stesso numero non si richiama due volte',
    /è già passato in cassa/.test(await cassa.innerText('.piede-comanda'))
  );

  // --- Azzera: ripulisce il banco senza toccare l'archivio -----------------
  await cassa.getByRole('button', { name: 'Aggiungi Patatine fritte' }).click();
  await cassa.getByLabel('Tavolo').fill('4');
  await cassa.waitForTimeout(600);
  await cassa.getByRole('button', { name: 'Azzera' }).click();
  await cassa.waitForTimeout(600);
  verifica(
    'Azzera ripulisce tutto',
    (await cassa.getByLabel('Tavolo').inputValue()) === '' &&
      /TOTALE\s+0,00/.test(await cassa.innerText('.piede-comanda'))
  );
  verifica('e non ha stampato niente', (await cassa.evaluate(() => window.__stampe.length)) === 3);

  // --- I due riepiloghi ----------------------------------------------------
  await cassa.getByRole('button', { name: 'Ordini cassa' }).click();
  await cassa.waitForTimeout(1800);
  const riepilogoCassa = await cassa.innerText('.riepilogo-ordini');
  verifica('il riepilogo della cassa elenca l’ordine appena fatto', riepilogoCassa.includes(codice), codice);
  const ordiniDopo = await cassa.locator('.riga-riepilogo').count();
  verifica(
    'il conto stampato prima non aveva registrato niente: un ordine solo in più',
    ordiniDopo === ordiniPrima + 1,
    `${ordiniPrima} → ${ordiniDopo}`
  );
  verifica('e non ci sono dentro gli ordini dal telefono', !riepilogoCassa.includes(codiceQr), codiceQr);
  await cassa.locator('.riga-riepilogo').first().getByRole('button', { name: 'Vedi' }).click();
  await cassa.waitForTimeout(500);
  verifica(
    'si apre il dettaglio con le voci',
    (await cassa.locator('.riga-riepilogo').first().locator('.voci-riepilogo li').count()) > 0
  );
  await cassa.locator('.riga-riepilogo').first().getByRole('button', { name: 'Ristampa' }).click();
  await cassa.waitForTimeout(800);
  verifica('e si ristampa il foglio perso', (await cassa.evaluate(() => window.__stampe.length)) === 4);

  // Cercare un ordine per codice: è il caso vero, un cliente che torna al
  // banco col foglio in mano e una lamentela.
  await cassa.getByLabel('Cerca ordine').fill(codice);
  await cassa.waitForTimeout(600);
  const trovate = cassa.locator('.riga-riepilogo');
  verifica('cercando il codice resta un ordine solo', (await trovate.count()) === 1, codice);
  verifica('ed è quello giusto', (await trovate.first().innerText()).includes(codice));
  verifica(
    'trovato da solo si apre già sulle sue voci',
    (await trovate.first().locator('.voci-riepilogo li').count()) > 0
  );
  verifica('e si vede quanti ordini sono rimasti', /1 ordine su/.test(await cassa.innerText('.esito-filtro')));

  // Anche mezzo codice basta, e il numero progressivo pure: sul telefono del
  // cliente c'è solo quello.
  await cassa.getByLabel('Cerca ordine').fill(codice.slice(1, 4));
  await cassa.waitForTimeout(600);
  verifica('basta un pezzo di codice', (await trovate.count()) >= 1, codice.slice(1, 4));

  await cassa.getByLabel('Cerca ordine').fill('ZZZZ');
  await cassa.waitForTimeout(600);
  verifica('cercando una cosa che non c’è lo dice', /Nessun ordine con questi filtri/.test(await cassa.innerText('.esito-filtro')));
  await cassa.getByRole('button', { name: 'Mostra tutti' }).click();
  await cassa.waitForTimeout(600);
  verifica('e "Mostra tutti" riporta l’elenco intero', (await trovate.count()) === ordiniDopo, `${ordiniDopo} righe`);

  // I filtri per stato: ce n'è uno solo per ogni stato che stasera esiste
  // davvero, col suo conteggio addosso.
  const filtroInCorso = cassa.locator('.filtro').filter({ hasText: /in preparazione/i });
  verifica('c’è il filtro degli ordini in preparazione', (await filtroInCorso.count()) === 1);
  await filtroInCorso.click();
  await cassa.waitForTimeout(600);
  const stati = await trovate.locator('.targhetta-stato').allInnerTexts();
  verifica(
    'filtrando resta solo quello stato',
    stati.length > 0 && stati.every((s) => /in preparazione/i.test(s)),
    `${stati.length} righe`
  );
  verifica('e il filtro scelto si vede acceso', (await cassa.locator('.filtro.scelto').innerText()).match(/in preparazione/i) !== null);
  await cassa.screenshot({ path: RISULTATI + '/cassa-riepilogo.png', fullPage: true });
  await cassa.getByRole('button', { name: 'Mostra tutti' }).click();
  await cassa.waitForTimeout(600);

  await cassa.getByRole('button', { name: 'Ordini QR' }).click();
  await cassa.waitForTimeout(1500);
  const riepilogoQr = await cassa.innerText('.riepilogo-ordini');
  verifica('il riepilogo del QR elenca l’ordine dal telefono', riepilogoQr.includes(codiceQr), codiceQr);
  verifica('e non quelli battuti al banco', !riepilogoQr.includes(codice), codice);

  // Un ordine sbagliato si annulla da qui, anche se è già partito.
  const righeQr = cassa.locator('.riga-riepilogo');
  const daAnnullare = righeQr.filter({ hasText: codiceQr }).first();
  await daAnnullare.getByRole('button', { name: 'Annulla' }).click();
  // Si aspetta che la riga diventi "annullato", non un tot di secondi: la
  // risposta del server arriva quando arriva, e in una serata piena di ordini
  // ci mette di più.
  const annullato = await cassa
    .waitForFunction(
      (cercato) => {
        const riga = [...document.querySelectorAll('.riga-riepilogo')].find((r) =>
          r.innerText.includes(cercato)
        );
        return riga ? /annullato/i.test(riga.innerText) : false;
      },
      codiceQr,
      { timeout: 30000 }
    )
    .then(() => true)
    .catch(() => false);
  verifica(
    'un ordine si annulla dal riepilogo',
    annullato,
    (await righeQr.filter({ hasText: codiceQr }).first().innerText()).split('\n').slice(0, 2).join(' ')
  );

  // --- Fine serata ---------------------------------------------------------
  await cassa.getByRole('button', { name: 'Fine serata' }).click();
  await cassa.waitForTimeout(1800);
  const fine = await cassa.innerText('.fine-serata');
  verifica('c’è il quadrato degli ordini completati', /Ordini completati/.test(fine));
  verifica('c’è il quadrato dell’incasso della cassa A', /Incasso cassa A/.test(fine));
  verifica('c’è il quadrato dell’incasso totale', /Incasso totale/.test(fine));
  const conteggio = (etichetta) => {
    const trovato = new RegExp(etichetta + '\\s+(\\d+)').exec(fine);
    return trovato ? Number(trovato[1]) : null;
  };
  const ordiniCassa = conteggio('Ordini dalla cassa');
  const ordiniCellulare = conteggio('Ordini dal cellulare');
  verifica('c’è il quadrato degli ordini presi in cassa', ordiniCassa > 0, String(ordiniCassa));
  verifica('c’è il quadrato degli ordini arrivati dal telefono', ordiniCellulare !== null, String(ordiniCellulare));
  verifica('c’è il quadrato dei coperti', conteggio('Coperti') > 0, String(conteggio('Coperti')));
  const comandeConfermate = Number((fine.match(/da (\d+) comand/) || [])[1]);
  verifica(
    'cassa più telefono fa il totale delle comande confermate',
    ordiniCassa + ordiniCellulare === comandeConfermate,
    `${ordiniCassa} + ${ordiniCellulare} = ${comandeConfermate}`
  );
  const cifra = (testo) => Number(testo.replace(/\./g, '').replace(',', '.'));
  const incassiCasse = [...fine.matchAll(/Incasso cassa [A-Z]\s+([\d.,]+)/g)].map((m) => cifra(m[1]));
  const incassoTotale = cifra((fine.match(/Incasso totale\s+([\d.,]+)/) || [])[1] ?? '0');
  verifica(
    'il totale è la somma di tutte le casse',
    incassiCasse.length > 0 && Math.abs(incassiCasse.reduce((s, n) => s + n, 0) - incassoTotale) < 0.005,
    `${incassiCasse.length} casse, totale ${incassoTotale.toFixed(2)}`
  );
  verifica('in fondo non ci sono più gli elenchi degli ordini in sospeso', (await cassa.locator('.elenchi-fine-serata').count()) === 0);

  // --- Tempo di emissione: si misura solo su una consegna vera -------------
  verifica('c’è il quadrato del tempo medio di emissione', /Tempo medio di emissione/.test(fine));
  const tempiPrima = await cassa.locator('.riga-tempo').count();
  const distribuzione = await entra(browser, 'distribuzione');
  await distribuzione.waitForTimeout(2500);
  // Il tasto resta spento finché l'ordine non ha il suo codice a barre: si
  // consegna il primo vassoio pronto, non per forza il primo dell'elenco.
  const consegnati = distribuzione.getByRole('button', { name: 'Consegnato' });
  await consegnati.first().waitFor();
  let consegnato = false;
  for (let i = 0; i < (await consegnati.count()) && !consegnato; i++) {
    if (await consegnati.nth(i).isEnabled()) {
      await consegnati.nth(i).click();
      consegnato = true;
    }
  }
  verifica('in distribuzione c’è un vassoio pronto da consegnare', consegnato);
  await distribuzione.waitForTimeout(3500);
  await cassa.waitForTimeout(2500);
  const conTempi = await cassa.innerText('.fine-serata');
  verifica(
    'la consegna aggiunge una riga all’elenco dei tempi',
    (await cassa.locator('.riga-tempo').count()) === tempiPrima + 1,
    `${tempiPrima} → ${await cassa.locator('.riga-tempo').count()}`
  );
  const medio = (conTempi.match(/Tempo medio di emissione\s+([^\n]+)/) || [])[1] || '';
  verifica('e il tempo medio è una durata, non un trattino', /^\d+\s*(s|min|h)/.test(medio), medio);
  verifica(
    'l’elenco dei tempi scorre invece di allungare la pagina',
    await cassa
      .locator('.elenco-tempi ul')
      .evaluate((u) => getComputedStyle(u).overflowY === 'auto' && u.clientHeight <= 420)
  );

  // --- Larghezze: solo i quadrati di fine serata prendono tutto ------------
  const largaFine = await cassa.evaluate(() =>
    Math.round(document.querySelector('.fine-serata').getBoundingClientRect().width)
  );
  verifica('Fine serata usa tutto lo schermo', largaFine > 1400, `${largaFine}px su 1600`);

  await cassa.getByRole('button', { name: 'Nuovo ordine', exact: true }).click();
  await cassa.waitForTimeout(900);
  const misure = await cassa.evaluate(() => {
    const tabella = document.querySelector('.tabella-ordine');
    // Quanto chiederebbe la tabella se nessuno le desse una misura: è quella
    // che la colonna deve prendere.
    const copia = tabella.cloneNode(true);
    copia.style.cssText = 'width:max-content;position:absolute;left:-9999px';
    document.body.appendChild(copia);
    const naturale = Math.round(copia.getBoundingClientRect().width);
    copia.remove();

    // Celle tagliate (il contenuto non ci sta) e regola del a capo, cella per
    // cella: le note devono poter andare a capo, tutte le altre no.
    let tagliate = 0;
    let sbagliate = 0;
    let note = 0;
    for (const cella of tabella.querySelectorAll('tbody tr:not(.riga-categoria) td')) {
      const eNota = cella.classList.contains('colonna-note');
      const aCapo = getComputedStyle(cella).whiteSpace !== 'nowrap';
      if (eNota) note++;
      if (aCapo !== eNota) sbagliate++;
      if (!eNota && cella.scrollWidth > cella.clientWidth + 1) tagliate++;
    }
    return {
      banco: Math.round(document.querySelector('.nuovo-ordine').getBoundingClientRect().width),
      menu: Math.round(document.querySelector('.colonna-comanda').getBoundingClientRect().width),
      naturale,
      tagliate,
      sbagliate,
      note,
    };
  });
  verifica('il banco non si allarga a tutto schermo', misure.banco <= 1200, `${misure.banco}px su 1600`);
  verifica(
    'la colonna del menù è larga quanto la tabella chiede',
    Math.abs(misure.menu - misure.naturale) <= 4,
    `colonna ${misure.menu}px, tabella ${misure.naturale}px`
  );
  verifica(
    'va a capo solo la colonna delle note',
    misure.note > 0 && misure.sbagliate === 0,
    `${misure.note} note, ${misure.sbagliate} celle fuori regola`
  );
  verifica('e nessuna cella taglia quello che contiene', misure.tagliate === 0);
  await cassa.screenshot({ path: RISULTATI + '/cassa-nuovo-ordine.png', fullPage: true });

  await cassa.getByRole('button', { name: 'Ordini cassa' }).click();
  await cassa.waitForTimeout(800);
  const largaRiepilogo = await cassa.evaluate(() =>
    Math.round(document.querySelector('.riepilogo-ordini').getBoundingClientRect().width)
  );
  verifica('i riepiloghi restano stretti', largaRiepilogo <= 1200, `${largaRiepilogo}px`);

  // Il foglio catturato, disegnato come uscirebbe su carta.
  const anteprimaFoglio = await browser.newPage();
  const css = await (await fetch('http://127.0.0.1:5173/src/App.css')).text().catch(() => '');
  await anteprimaFoglio.setContent(
    `<style>${css.replace(/@media print\s*\{/g, '@media all {')}</style><div class="area-stampa" style="display:block">${definitivo}</div>`
  );
  await anteprimaFoglio.pdf({ path: RISULTATI + '/foglio-resoconto.pdf', format: 'A5', printBackground: true });

  await browser.close();
  const falliti = esiti.filter((e) => !e.ok);
  console.log(`\n${esiti.length - falliti.length}/${esiti.length} controlli passati.`);
  process.exit(falliti.length === 0 ? 0 : 1);
})();
