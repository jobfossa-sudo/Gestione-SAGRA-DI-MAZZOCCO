// Verifica il comportamento delle Cloud Functions (logica ordini e ruoli)
// contro gli emulatori Firestore + Functions + Auth. Va eseguito con:
//
//   firebase emulators:exec --only firestore,functions,auth \
//     "node functions/scripts/seed.js && node functions/scripts/test-functions.js"
//
// Non tocca mai i dati reali (solo gli emulatori locali).

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

const clientApp = initializeApp({ projectId: 'gestione-sagra-mazzocco', apiKey: 'fake-per-emulatore' });
const auth = getAuth(clientApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
const functions = getFunctions(clientApp);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);

const inizializzaSistema = httpsCallable(functions, 'inizializzaSistema');
const creaUtente = httpsCallable(functions, 'creaUtente');
const aggiornaPermessi = httpsCallable(functions, 'aggiornaPermessi');
const reimpostaPassword = httpsCallable(functions, 'reimpostaPassword');
const impostaAttivo = httpsCallable(functions, 'impostaAttivo');
const apriSerata = httpsCallable(functions, 'apriSerata');
const creaOrdineBozza = httpsCallable(functions, 'creaOrdineBozza');
const creaOrdineCassa = httpsCallable(functions, 'creaOrdineCassa');
const confermaOrdine = httpsCallable(functions, 'confermaOrdine');
const segnaSottoOrdinePronto = httpsCallable(functions, 'segnaSottoOrdinePronto');
const consegnaSottoOrdine = httpsCallable(functions, 'consegnaSottoOrdine');
const annullaOrdine = httpsCallable(functions, 'annullaOrdine');

const SERATA_ID = new Date().toISOString().slice(0, 10);
// Deve coincidere con functions/.env.local e con seed.js.
const CODICE_INIZIALIZZAZIONE = 'codice-prova-emulatore';
const PASSWORD_PROVA = 'prova1234';

async function accediCome(nomeUtente, password = PASSWORD_PROVA) {
  await signOut(auth);
  await signInWithEmailAndPassword(auth, `${nomeUtente}@utenti.sagra-mazzocco.invalid`, password);
}

const esiti = [];
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
    record(nome, ok, ok ? undefined : `codice ricevuto: ${err.code} — ${err.message}`);
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
  record('creaOrdineBozza calcola il totale dal prezzo reale del prodotto', bozza1.totale === 5 * 2 + 3 * 2, `totale: ${bozza1.totale}`);

  await accediCome('cucina');
  await assertRifiutato(
    'la cucina non può confermare ordini in cassa',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero }),
    'permission-denied'
  );

  await accediCome('cassa');
  const conferma1 = await assertOk(
    'confermaOrdine (cassa conferma la bozza per numero)',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero })
  );

  const sottoOrdiniOrdine1 = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', conferma1.ordineId)
    .get();
  record('confermaOrdine genera un sotto-ordine per reparto', sottoOrdiniOrdine1.size === 2, `generati: ${sottoOrdiniOrdine1.size}`);

  await assertRifiutato(
    'una seconda conferma dello stesso ordine viene rifiutata',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero }),
    'failed-precondition'
  );

  const sottoCucina = sottoOrdiniOrdine1.docs.find((d) => d.data().reparto === 'cucina');
  const sottoBevande = sottoOrdiniOrdine1.docs.find((d) => d.data().reparto === 'bevande');

  // --- 2. Reparti: ciascuno segna pronto solo il proprio --------------------
  await assertRifiutato(
    'la cassa non può segnare pronto un sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoCucina.id }),
    'permission-denied'
  );

  await accediCome('cucina');
  await assertRifiutato(
    'la cucina non può segnare pronto un sotto-ordine delle bevande',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoBevande.id }),
    'permission-denied'
  );
  await assertOk(
    'la cucina segna pronto il proprio sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoCucina.id })
  );

  // --- 3. Consegna: l'ordine si completa solo all'ultimo sotto-ordine --------
  await assertRifiutato(
    'la cucina non può registrare consegne',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoCucina.data().codice }),
    'permission-denied'
  );

  await accediCome('consegna');
  const consegna1 = await assertOk(
    'consegna del sotto-ordine della cucina',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoCucina.data().codice })
  );
  record('dopo la prima consegna l’ordine non è ancora completato', consegna1.ordineCompletato === false);

  await assertRifiutato(
    'consegna di un sotto-ordine non ancora pronto viene rifiutata',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoBevande.data().codice }),
    'failed-precondition'
  );

  await accediCome('bevande');
  await assertOk(
    'le bevande segnano pronto il proprio sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoBevande.id })
  );

  await accediCome('consegna');
  const consegna2 = await assertOk(
    'consegna dell’ultimo sotto-ordine',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoBevande.data().codice })
  );
  record('dopo l’ultima consegna l’ordine risulta completato', consegna2.ordineCompletato === true);

  // --- 4. Ordine diretto da cassa ----------------------------------------------
  await accediCome('cassa');
  const ordineCassa = await assertOk(
    'creaOrdineCassa (cassa, ordine diretto)',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'grigliata', quantita: 1 }] })
  );
  const ordineCassaDoc = await db.doc(`serate/${SERATA_ID}/ordini/${ordineCassa.ordineId}`).get();
  record('l’ordine da cassa parte subito "in_evasione"', ordineCassaDoc.data().stato === 'in_evasione');

  // --- 4bis. Volontaria con due ruoli: fa entrambe le cose ---------------------
  await accediCome('jolly');
  const ordineJolly = await assertOk(
    'chi ha i ruoli cassa e consegna può incassare',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'birra', quantita: 1 }] })
  );
  const sottoJolly = (
    await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', ordineJolly.ordineId).get()
  ).docs[0];
  await assertRifiutato(
    'ma non può segnare pronto un sotto-ordine (non è un ruolo di reparto)',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoJolly.id }),
    'permission-denied'
  );
  await accediCome('bevande');
  await assertOk(
    'il reparto bevande segna pronto',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoJolly.id })
  );
  await accediCome('jolly');
  await assertOk(
    'e con l’altro ruolo la stessa persona registra la consegna',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoJolly.data().codice })
  );

  // --- 5. Annullamento: solo amministratore -----------------------------------
  await accediCome('cassa');
  await assertRifiutato(
    'la cassa non può annullare ordini',
    annullaOrdine({ serataId: SERATA_ID, ordineId: ordineCassa.ordineId }),
    'permission-denied'
  );
  await accediCome('admin');
  await assertOk('l’amministratore annulla un ordine', annullaOrdine({ serataId: SERATA_ID, ordineId: ordineCassa.ordineId }));
  await assertRifiutato(
    'un ordine già annullato non si annulla di nuovo',
    annullaOrdine({ serataId: SERATA_ID, ordineId: ordineCassa.ordineId }),
    'failed-precondition'
  );

  // --- 6. Apertura serata: solo amministratore --------------------------------
  await accediCome('cassa');
  await assertRifiutato('la cassa non può aprire una serata', apriSerata({ data: '2030-01-01' }), 'permission-denied');
  await accediCome('admin');
  await assertOk('l’amministratore apre una serata', apriSerata({ data: '2030-01-01' }));

  // --- 7. Account senza ruolo e anonimi ---------------------------------------
  await accediCome('senzaruolo');
  await assertRifiutato(
    'un account senza ruolo non può creare ordini in cassa',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'permission-denied'
  );
  await signOut(auth);
  await assertRifiutato(
    'senza accesso non si creano ordini in cassa',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'unauthenticated'
  );

  // --- 8. Validazioni --------------------------------------------------------
  await assertRifiutato(
    'creaOrdineBozza con prodotto inesistente viene rifiutato',
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 1, coperti: 1, items: [{ prodottoId: 'non-esiste', quantita: 1 }] }),
    'not-found'
  );
  await assertRifiutato(
    'creaOrdineBozza su una serata inesistente viene rifiutato',
    creaOrdineBozza({ serataId: 'serata-inesistente', tavolo: 1, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'not-found'
  );

  // --- 9. Numerazione concorrente ----------------------------------------------
  const [concorrente1, concorrente2] = await Promise.all([
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 10, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 11, coperti: 1, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
  ]);
  record(
    'due ordini creati in parallelo ottengono numeri diversi',
    concorrente1.data.numero !== concorrente2.data.numero,
    `numeri: ${concorrente1.data.numero}, ${concorrente2.data.numero}`
  );

  // --- 10. Primo amministratore -------------------------------------------------
  await assertRifiutato(
    'inizializzaSistema con codice sbagliato viene rifiutato',
    inizializzaSistema({ codice: 'tentativo', nomeUtente: 'intruso', nome: 'Intruso', password: 'password123' }),
    'permission-denied'
  );
  await assertRifiutato(
    'inizializzaSistema con password troppo corta viene rifiutato',
    inizializzaSistema({ codice: CODICE_INIZIALIZZAZIONE, nomeUtente: 'titolare', nome: 'Titolare', password: 'corta' }),
    'invalid-argument'
  );
  await assertOk(
    'inizializzaSistema crea il primo amministratore (anche dopo un tentativo fallito)',
    inizializzaSistema({ codice: CODICE_INIZIALIZZAZIONE, nomeUtente: 'titolare', nome: 'Titolare', password: 'password-titolare' })
  );
  await accediCome('titolare', 'password-titolare');
  await assertOk('il nuovo amministratore ha davvero i poteri di amministratore', apriSerata({ data: '2030-01-02' }));
  await signOut(auth);
  await assertRifiutato(
    'inizializzaSistema non si può ripetere',
    inizializzaSistema({ codice: CODICE_INIZIALIZZAZIONE, nomeUtente: 'secondo', nome: 'Secondo', password: 'password123' }),
    'failed-precondition'
  );

  // --- 11. Gestione utenti (app "Utenti") --------------------------------------
  await accediCome('cassa');
  await assertRifiutato(
    'la cassa non può creare utenti',
    creaUtente({ nomeUtente: 'abusivo', nome: 'Abusivo', password: 'password123', amministratore: true, accessi: {} }),
    'permission-denied'
  );

  await accediCome('admin');
  const mario = await assertOk(
    'l’amministratore crea un utente con ruolo in Comande',
    creaUtente({ nomeUtente: 'mario', nome: 'Mario Rossi', password: 'password-mario', amministratore: false, accessi: { comande: ['cassa'] } })
  );
  await assertRifiutato(
    'non si può creare un utente con un nome già in uso',
    creaUtente({ nomeUtente: 'mario', nome: 'Altro Mario', password: 'password123', amministratore: false, accessi: {} }),
    'already-exists'
  );
  await assertRifiutato(
    'non si può assegnare un ruolo inesistente',
    creaUtente({ nomeUtente: 'strano', nome: 'Strano', password: 'password123', amministratore: false, accessi: { comande: ['sindaco'] } }),
    'invalid-argument'
  );

  await accediCome('mario', 'password-mario');
  const ordineMario = await assertOk(
    'il nuovo utente lavora subito con il ruolo assegnato',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  record('l’ordine del nuovo utente è stato creato', typeof ordineMario.numero === 'number');

  await accediCome('admin');
  await assertRifiutato(
    'l’amministratore non può togliere i permessi a sé stesso',
    aggiornaPermessi({ uid: (await admin.auth().getUserByEmail('admin@utenti.sagra-mazzocco.invalid')).uid, amministratore: false, accessi: {} }),
    'failed-precondition'
  );
  await assertOk(
    'l’amministratore sposta l’utente in cucina',
    aggiornaPermessi({ uid: mario.uid, amministratore: false, accessi: { comande: ['cucina'] } })
  );

  await accediCome('mario', 'password-mario');
  await assertRifiutato(
    'dopo il cambio di ruolo l’utente non può più incassare',
    creaOrdineCassa({ serataId: SERATA_ID, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'permission-denied'
  );

  await accediCome('admin');
  await assertOk('l’amministratore reimposta la password', reimpostaPassword({ uid: mario.uid, password: 'password-nuova' }));
  await accediCome('mario', 'password-nuova');
  record('l’utente entra con la nuova password', true);

  await accediCome('admin');
  await assertOk('l’amministratore disattiva l’utente', impostaAttivo({ uid: mario.uid, attivo: false }));
  let accessoNegato = false;
  try {
    await accediCome('mario', 'password-nuova');
  } catch (err) {
    accessoNegato = err.code === 'auth/user-disabled';
  }
  record('un utente disattivato non riesce più ad accedere', accessoNegato);

  await accediCome('admin');
  await assertOk('l’amministratore riattiva l’utente', impostaAttivo({ uid: mario.uid, attivo: true }));
  await accediCome('mario', 'password-nuova');
  record('l’utente riattivato rientra', true);

  console.log('\nRisultati test Cloud Functions:');
  let tuttiOk = true;
  for (const e of esiti) {
    console.log(`  ${e.ok ? 'OK ' : 'FALLITO'} - ${e.nome}${e.dettaglio && !e.ok ? ` (${e.dettaglio})` : ''}`);
    if (!e.ok) tuttiOk = false;
  }

  if (!tuttiOk) {
    console.error('\nAlcuni test sono falliti.');
    process.exit(1);
  }
  console.log(`\nTutti i ${esiti.length} test sono passati.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore inatteso nello script di test:', err);
  process.exit(1);
});
