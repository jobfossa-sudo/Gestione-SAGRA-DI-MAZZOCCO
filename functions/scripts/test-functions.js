// Verifica il comportamento delle Cloud Functions di logica ordini (Step 2)
// contro gli emulatori Firestore + Functions + Auth. Va eseguito con:
//
//   firebase emulators:exec --only firestore,functions,auth \
//     "node functions/scripts/seed.js && node functions/scripts/test-functions.js"
//
// Non tocca mai i dati reali (solo gli emulatori locali).

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInAnonymously, signOut } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

const clientApp = initializeApp({ projectId: 'gestione-sagra-mazzocco', apiKey: 'fake-per-emulatore' });
const auth = getAuth(clientApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
const functions = getFunctions(clientApp);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

const creaOrdineBozza = httpsCallable(functions, 'creaOrdineBozza');
const creaOrdineCassa = httpsCallable(functions, 'creaOrdineCassa');
const confermaOrdine = httpsCallable(functions, 'confermaOrdine');
const segnaSottoOrdinePronto = httpsCallable(functions, 'segnaSottoOrdinePronto');
const consegnaSottoOrdine = httpsCallable(functions, 'consegnaSottoOrdine');
const annullaOrdine = httpsCallable(functions, 'annullaOrdine');

const SERATA_ID = new Date().toISOString().slice(0, 10);

let esiti = [];
function record(nome, ok, dettaglio) {
  esiti.push({ nome, ok, dettaglio });
}

async function assertOk(nome, promise) {
  try {
    const risultato = await promise;
    record(nome, true);
    return risultato.data;
  } catch (err) {
    record(nome, false, err.message);
    throw err;
  }
}

async function assertRifiutato(nome, promise, codiceAtteso) {
  try {
    await promise;
    record(nome, false, 'la chiamata è riuscita ma doveva essere rifiutata');
  } catch (err) {
    const ok = !codiceAtteso || err.code === `functions/${codiceAtteso}`;
    record(nome, ok, ok ? undefined : `codice ricevuto: ${err.code}`);
  }
}

async function main() {
  // --- 1. Ordine da QR (bozza), poi conferma da cassa -----------------------
  await signOut(auth); // il flusso QR non è autenticato
  const bozza1 = await assertOk(
    'creaOrdineBozza (cliente da QR, non autenticato)',
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 7, coperti: 2, items: [
      { prodottoId: 'panino', quantita: 2 },
      { prodottoId: 'birra', quantita: 2 },
    ] })
  );
  if (bozza1.totale !== 5 * 2 + 3 * 2) {
    record('creaOrdineBozza calcola il totale dal prezzo reale del prodotto', false, `totale ricevuto: ${bozza1.totale}`);
  } else {
    record('creaOrdineBozza calcola il totale dal prezzo reale del prodotto', true);
  }

  await signInAnonymously(auth); // simula il personale di cassa autenticato
  const conferma1 = await assertOk(
    'confermaOrdine (cassiere autenticato conferma la bozza per numero)',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero })
  );

  const sottoOrdiniOrdine1 = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', conferma1.ordineId)
    .get();
  record(
    'confermaOrdine genera un sotto-ordine per reparto (cucina + bevande)',
    sottoOrdiniOrdine1.size === 2,
    `sotto-ordini generati: ${sottoOrdiniOrdine1.size}`
  );
  const codici1 = sottoOrdiniOrdine1.docs.map((d) => d.data().codice).sort();
  record(
    'i codici dei sotto-ordini hanno il prefisso di reparto corretto',
    codici1[0]?.startsWith('B') && codici1[1]?.startsWith('C'),
    `codici: ${codici1.join(', ')}`
  );

  await assertRifiutato(
    'confermaOrdine sullo stesso numero una seconda volta viene rifiutato (niente doppi sotto-ordini)',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero }),
    'failed-precondition'
  );
  const sottoOrdiniDopoDoppiaConferma = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', conferma1.ordineId)
    .get();
  record(
    'la doppia conferma non ha creato sotto-ordini duplicati',
    sottoOrdiniDopoDoppiaConferma.size === 2,
    `sotto-ordini presenti: ${sottoOrdiniDopoDoppiaConferma.size}`
  );

  // --- 2. Consegna dei due sotto-ordini: l'ordine si completa solo all'ultimo
  const [primoSotto, secondoSotto] = sottoOrdiniOrdine1.docs;
  await assertOk('segnaSottoOrdinePronto (primo sotto-ordine)', segnaSottoOrdinePronto({
    serataId: SERATA_ID,
    sottoOrdineId: primoSotto.id,
  }));
  const consegna1 = await assertOk('consegnaSottoOrdine (primo sotto-ordine, scansione barcode)', consegnaSottoOrdine({
    serataId: SERATA_ID,
    codice: primoSotto.data().codice,
  }));
  record('dopo la prima consegna l\'ordine non è ancora completato', consegna1.ordineCompletato === false);

  await assertRifiutato(
    'consegnaSottoOrdine su un sotto-ordine non ancora pronto viene rifiutato',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: secondoSotto.data().codice }),
    'failed-precondition'
  );

  await assertOk('segnaSottoOrdinePronto (secondo sotto-ordine)', segnaSottoOrdinePronto({
    serataId: SERATA_ID,
    sottoOrdineId: secondoSotto.id,
  }));
  const consegna2 = await assertOk('consegnaSottoOrdine (secondo sotto-ordine, ultimo dell\'ordine)', consegnaSottoOrdine({
    serataId: SERATA_ID,
    codice: secondoSotto.data().codice,
  }));
  record('dopo la consegna dell\'ultimo sotto-ordine l\'ordine risulta completato', consegna2.ordineCompletato === true);

  const ordine1Finale = await db.doc(`serate/${SERATA_ID}/ordini/${conferma1.ordineId}`).get();
  record(
    'lo stato dell\'ordine su Firestore è "completata"',
    ordine1Finale.data().stato === 'completata',
    `stato: ${ordine1Finale.data().stato}`
  );

  // --- 3. Ordine diretto da cassa: sotto-ordini generati subito --------------
  const ordineCassa = await assertOk('creaOrdineCassa (cassiere, ordine diretto)', creaOrdineCassa({
    serataId: SERATA_ID,
    items: [{ prodottoId: 'grigliata', quantita: 1 }],
  }));
  const ordineCassaDoc = await db.doc(`serate/${SERATA_ID}/ordini/${ordineCassa.ordineId}`).get();
  record(
    'creaOrdineCassa crea l\'ordine già in stato "in_evasione"',
    ordineCassaDoc.data().stato === 'in_evasione',
    `stato: ${ordineCassaDoc.data().stato}`
  );
  const sottoOrdiniCassa = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', ordineCassa.ordineId)
    .get();
  record('creaOrdineCassa genera subito il sotto-ordine di reparto', sottoOrdiniCassa.size === 1);

  // --- 4. Annullamento di una bozza mai pagata --------------------------------
  await signOut(auth);
  const bozzaDaAnnullare = await assertOk('creaOrdineBozza (per test annullamento)', creaOrdineBozza({
    serataId: SERATA_ID, tavolo: 3, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }],
  }));
  await signInAnonymously(auth);
  await assertOk('annullaOrdine (cassiere annulla una bozza mai pagata)', annullaOrdine({
    serataId: SERATA_ID,
    ordineId: bozzaDaAnnullare.ordineId,
  }));
  await assertRifiutato(
    'annullaOrdine su un ordine già annullato viene rifiutato',
    annullaOrdine({ serataId: SERATA_ID, ordineId: bozzaDaAnnullare.ordineId }),
    'failed-precondition'
  );

  // --- 5. Controlli di sicurezza/validazione ----------------------------------
  await signOut(auth);
  await assertRifiutato(
    'creaOrdineCassa senza autenticazione viene rifiutato',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'unauthenticated'
  );
  await assertRifiutato(
    'creaOrdineBozza con prodotto inesistente viene rifiutato',
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 1, coperti: 1, items: [{ prodottoId: 'non-esiste', quantita: 1 }] }),
    'not-found'
  );
  await assertRifiutato(
    'creaOrdineBozza su una serata chiusa viene rifiutato',
    creaOrdineBozza({ serataId: 'serata-chiusa-test', tavolo: 1, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'not-found'
  );

  // --- 6. Numerazione concorrente: due bozze create in parallelo -------------
  const [concorrente1, concorrente2] = await Promise.all([
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 10, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 11, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
  ]);
  record(
    'due ordini creati in parallelo ottengono numeri diversi (nessuna duplicazione)',
    concorrente1.data.numero !== concorrente2.data.numero,
    `numeri: ${concorrente1.data.numero}, ${concorrente2.data.numero}`
  );

  console.log('\nRisultati test Cloud Functions (Step 2):');
  let tuttiOk = true;
  for (const e of esiti) {
    console.log(`  ${e.ok ? 'OK ' : 'FALLITO'} - ${e.nome}${e.dettaglio ? ` (${e.dettaglio})` : ''}`);
    if (!e.ok) tuttiOk = false;
  }

  if (!tuttiOk) {
    console.error('\nAlcuni test sono falliti.');
    process.exit(1);
  }
  console.log('\nTutti i test sono passati.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore inatteso nello script di test:', err);
  process.exit(1);
});
