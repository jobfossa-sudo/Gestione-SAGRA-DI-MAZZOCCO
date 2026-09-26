// Verifica il comportamento delle Cloud Functions (logica ordini e ruoli)
// contro gli emulatori Firestore + Functions + Auth. Vuole un archivio
// vergine, quindi gira su emulatori suoi, su porte diverse da quelle del
// sistema locale di tutti i giorni: così si può provare mentre qualcuno sta
// usando l'app, senza cancellargli i dati sotto il naso. Va eseguito con:
//
//   firebase emulators:exec --config firebase.prove.json \
//     "node functions/scripts/seed.js && node functions/scripts/test-functions.js"
//
// Non tocca mai i dati reali (solo gli emulatori locali).

// Le porte arrivano da firebase.prove.json: emulators:exec le mette negli
// ambienti, e i valori qui sotto servono solo se si lancia lo script a mano.
const FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8081';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9098';
const [FUNZIONI_HOST, FUNZIONI_PORTA] = (process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5002').split(':');

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH;

const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

const clientApp = initializeApp({ projectId: 'gestione-sagra-mazzocco', apiKey: 'fake-per-emulatore' });
const auth = getAuth(clientApp);
connectAuthEmulator(auth, `http://${AUTH}`);
const functions = getFunctions(clientApp);
connectFunctionsEmulator(functions, FUNZIONI_HOST, Number(FUNZIONI_PORTA));

const inizializzaSistema = httpsCallable(functions, 'inizializzaSistema');
const creaUtente = httpsCallable(functions, 'creaUtente');
const aggiornaPermessi = httpsCallable(functions, 'aggiornaPermessi');
const reimpostaPassword = httpsCallable(functions, 'reimpostaPassword');
const impostaAttivo = httpsCallable(functions, 'impostaAttivo');
const eliminaUtente = httpsCallable(functions, 'eliminaUtente');
const impostaPorzioni = httpsCallable(functions, 'impostaPorzioni');
const segnaEsaurito = httpsCallable(functions, 'segnaEsaurito');
const apriSerata = httpsCallable(functions, 'apriSerata');
const creaOrdineBozza = httpsCallable(functions, 'creaOrdineBozza');
const creaOrdineCassa = httpsCallable(functions, 'creaOrdineCassa');
const confermaOrdine = httpsCallable(functions, 'confermaOrdine');
const segnaSottoOrdinePronto = httpsCallable(functions, 'segnaSottoOrdinePronto');
const consegnaSottoOrdine = httpsCallable(functions, 'consegnaSottoOrdine');
const annullaOrdine = httpsCallable(functions, 'annullaOrdine');
const impostaLetteraCassa = httpsCallable(functions, 'impostaLetteraCassa');
const segnaCopiaCucinaStampata = httpsCallable(functions, 'segnaCopiaCucinaStampata');
const chiudiOrdine = httpsCallable(functions, 'chiudiOrdine');
const creaOrdineBanco = httpsCallable(functions, 'creaOrdineBanco');
const annullaOrdineBanco = httpsCallable(functions, 'annullaOrdineBanco');
const segnaComandaStampata = httpsCallable(functions, 'segnaComandaStampata');
const segnalaBagno = httpsCallable(functions, 'segnalaBagno');
const prendiSegnalazione = httpsCallable(functions, 'prendiSegnalazione');

/** La cassa conferma a pagamento avvenuto: un'unica chiamata che crea
 * l'ordine, scala le porzioni e manda le comande ai reparti. */
async function creaEInvia(dati) {
  return creaOrdineCassa(dati);
}

// Stessa regola di idSerata() in shared/src/index.ts: fino alle due di notte
// si sta ancora nella serata di ieri.
function idSerata(momento = new Date()) {
  const spostato = new Date(momento.getTime() - 2 * 60 * 60 * 1000);
  const anno = spostato.getFullYear();
  const mese = String(spostato.getMonth() + 1).padStart(2, '0');
  const giorno = String(spostato.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

const SERATA_ID = idSerata();
// Deve coincidere con functions/.env.local e con seed.js.
const CODICE_INIZIALIZZAZIONE = 'codice-prova-emulatore';
const PASSWORD_PROVA = 'prova1234';
// Tavolo e coperti sono obbligatori per gli ordini battuti in cassa.
const TAVOLO = { tavolo: 4, coperti: 2 };

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
      { prodottoId: 'pasta', quantita: 1 },
      { prodottoId: 'panino', quantita: 2 },
      { prodottoId: 'birra', quantita: 2 },
    ] })
  );
  record('creaOrdineBozza calcola il totale dal prezzo reale del prodotto', bozza1.totale === 7 + 5 * 2 + 3 * 2, `totale: ${bozza1.totale}`);

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
  record('confermaOrdine genera un sotto-ordine per settore', sottoOrdiniOrdine1.size === 3, `generati: ${sottoOrdiniOrdine1.size}`);

  await assertRifiutato(
    'una seconda conferma dello stesso ordine viene rifiutata',
    confermaOrdine({ serataId: SERATA_ID, numero: bozza1.numero }),
    'failed-precondition'
  );

  const sottoCucina = sottoOrdiniOrdine1.docs.find((d) => d.data().settore === 'cucina');
  const sottoGriglia = sottoOrdiniOrdine1.docs.find((d) => d.data().settore === 'griglia');
  const sottoBar = sottoOrdiniOrdine1.docs.find((d) => d.data().settore === 'bar');
  record(
    'ogni sotto-ordine porta il prefisso del proprio settore',
    sottoCucina.data().codice.startsWith('C') &&
      sottoGriglia.data().codice.startsWith('G') &&
      sottoBar.data().codice.startsWith('B'),
    `codici: ${sottoCucina.data().codice}, ${sottoGriglia.data().codice}, ${sottoBar.data().codice}`
  );

  // --- 2. Settori: ciascuno segna pronto solo il proprio --------------------
  await assertRifiutato(
    'la cassa non può segnare pronto un sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoCucina.id }),
    'permission-denied'
  );

  await accediCome('cucina');
  await assertRifiutato(
    'la cucina non può segnare pronto un sotto-ordine della griglia',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoGriglia.id }),
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

  await accediCome('distribuzione');
  const consegna1 = await assertOk(
    'consegna del sotto-ordine della cucina',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoCucina.data().codice })
  );
  record('dopo la prima consegna l’ordine non è ancora completato', consegna1.ordineCompletato === false);

  await assertRifiutato(
    'consegna di un sotto-ordine non ancora pronto viene rifiutata',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoGriglia.data().codice }),
    'failed-precondition'
  );

  await accediCome('griglia');
  await assertOk(
    'la griglia segna pronto il proprio sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoGriglia.id })
  );

  await accediCome('distribuzione');
  const consegna2 = await assertOk(
    'consegna del sotto-ordine della griglia',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoGriglia.data().codice })
  );
  record('con il bar ancora da consegnare l’ordine non è completato', consegna2.ordineCompletato === false);

  await accediCome('bar');
  await assertOk(
    'il bar segna pronto il proprio sotto-ordine',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoBar.id })
  );

  await accediCome('distribuzione');
  const consegna3 = await assertOk(
    'consegna dell’ultimo sotto-ordine',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoBar.data().codice })
  );
  record('dopo l’ultima consegna l’ordine risulta completato', consegna3.ordineCompletato === true);

  // --- 4. Ordine diretto da cassa ----------------------------------------------
  await accediCome('cassa');
  const ordineCassa = await assertOk(
    'creaOrdineCassa (cassa, ordine diretto)',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'grigliata', quantita: 1 }] })
  );
  const ordineCassaDoc = await db.doc(`serate/${SERATA_ID}/ordini/${ordineCassa.ordineId}`).get();
  record('l’ordine da cassa parte subito "in_evasione"', ordineCassaDoc.data().stato === 'in_evasione');

  // --- 4bis. Volontaria con due ruoli: fa entrambe le cose ---------------------
  await accediCome('jolly');
  const ordineJolly = await assertOk(
    'chi ha i ruoli cassa e distribuzione può incassare',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'birra', quantita: 1 }] })
  );
  const sottoJolly = (
    await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', ordineJolly.ordineId).get()
  ).docs[0];
  await assertRifiutato(
    'ma non può segnare pronto un sotto-ordine (non è un ruolo di settore)',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoJolly.id }),
    'permission-denied'
  );
  await accediCome('bar');
  await assertOk(
    'il settore bar segna pronto',
    segnaSottoOrdinePronto({ serataId: SERATA_ID, sottoOrdineId: sottoJolly.id })
  );
  await accediCome('jolly');
  await assertOk(
    'e con l’altro ruolo la stessa persona registra la consegna della comanda',
    consegnaSottoOrdine({ serataId: SERATA_ID, codice: sottoJolly.data().codice })
  );

  // --- 5. Annullamento: solo amministratore -----------------------------------
  // La cassa annulla da sé: con la conferma a pagamento avvenuto un errore si
  // scopre a ordine già partito, e non si può dipendere dall'amministratore.
  await accediCome('cassa');
  await assertOk('la cassa annulla un ordine', annullaOrdine({ serataId: SERATA_ID, ordineId: ordineCassa.ordineId }));
  await accediCome('admin');
  await assertRifiutato(
    'un ordine già annullato non si annulla di nuovo, nemmeno da amministratore',
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
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'permission-denied'
  );
  await signOut(auth);
  await assertRifiutato(
    'senza accesso non si creano ordini in cassa',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
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
    creaUtente({ nomeUtente: 'mario', nome: 'Mario Rossi', password: 'password-mario', amministratore: false, accessi: { comande: ['cassa'] }, letteraCassa: 'c' })
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
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  record('l’ordine del nuovo utente prende la sua lettera (minuscola accettata)', /^C\d{4}$/.test(ordineMario.codice), `codice: ${ordineMario.codice}`);

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
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
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

  // --- 12. Eliminazione definitiva di un'utenza --------------------------------
  await accediCome('cassa');
  await assertRifiutato('la cassa non può eliminare utenti', eliminaUtente({ uid: mario.uid }), 'permission-denied');

  await accediCome('admin');
  const uidAdmin = (await admin.auth().getUserByEmail('admin@utenti.sagra-mazzocco.invalid')).uid;
  await assertRifiutato(
    'l’amministratore non può eliminare sé stesso',
    eliminaUtente({ uid: uidAdmin }),
    'failed-precondition'
  );
  await assertOk('l’amministratore elimina un’utenza', eliminaUtente({ uid: mario.uid }));

  const profiloEliminato = await db.doc(`utenti/${mario.uid}`).get();
  record('il profilo eliminato sparisce da Firestore', profiloEliminato.exists === false);
  let accountEliminato = false;
  try {
    await admin.auth().getUser(mario.uid);
  } catch (err) {
    accountEliminato = err.code === 'auth/user-not-found';
  }
  record('l’account eliminato sparisce da Authentication', accountEliminato);

  let accessoImpossibile = false;
  try {
    await accediCome('mario', 'password-nuova');
  } catch (err) {
    accessoImpossibile = err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found';
  }
  record('chi è stato eliminato non riesce più ad accedere', accessoImpossibile);

  // --- 13. Porzioni della serata -----------------------------------------------
  await accediCome('cassa');
  await assertRifiutato(
    'la cassa non può impostare le porzioni',
    impostaPorzioni({ serataId: SERATA_ID, prodottoId: 'vino', porzioniMassime: 100 }),
    'permission-denied'
  );

  await accediCome('admin');
  await assertOk(
    'l’amministratore imposta 3 porzioni di vino per stasera',
    impostaPorzioni({ serataId: SERATA_ID, prodottoId: 'vino', porzioniMassime: 3 })
  );

  await accediCome('cassa');
  await assertRifiutato(
    'non si possono ordinare più porzioni di quante ne restano',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'vino', quantita: 4 }] }),
    'failed-precondition'
  );
  const ordineVino = await assertOk(
    'si possono ordinare esattamente le porzioni rimaste',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'vino', quantita: 3 }] })
  );

  const dopoVendita = (await db.doc(`serate/${SERATA_ID}/disponibilita/vino`).get()).data();
  record('le porzioni vendute vengono contate', dopoVendita.venduti === 3, `venduti: ${dopoVendita?.venduti}`);
  const vinoFinito = (await db.doc('prodotti/vino').get()).data();
  record('al raggiungimento del massimo il piatto risulta finito', vinoFinito.esauritoSerata === SERATA_ID);

  await assertRifiutato(
    'a porzioni finite l’ordine viene rifiutato con il messaggio giusto',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'vino', quantita: 1 }] }),
    'failed-precondition'
  );

  await accediCome('admin');
  await assertOk('annullando l’ordine le porzioni tornano vendibili', annullaOrdine({ serataId: SERATA_ID, ordineId: ordineVino.ordineId }));
  const dopoAnnullamento = (await db.doc(`serate/${SERATA_ID}/disponibilita/vino`).get()).data();
  record('il contatore torna indietro', dopoAnnullamento.venduti === 0, `venduti: ${dopoAnnullamento?.venduti}`);

  await assertOk(
    'l’amministratore può segnare un piatto esaurito a mano',
    segnaEsaurito({ serataId: SERATA_ID, prodottoId: 'pasta', esaurito: true })
  );
  await accediCome('cassa');
  await assertRifiutato(
    'un piatto segnato esaurito non si può ordinare',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'pasta', quantita: 1 }] }),
    'failed-precondition'
  );
  await signOut(auth);
  await assertRifiutato(
    'nemmeno il cliente dal QR può ordinare un piatto finito',
    creaOrdineBozza({ serataId: SERATA_ID, tavolo: 5, coperti: 1, items: [{ prodottoId: 'pasta', quantita: 1 }] }),
    'failed-precondition'
  );

  // --- 14. Composizioni dei piatti -----------------------------------------
  // L'esempio del comitato: grigliata mista = 2 costicine + 1/2 pollo +
  // 1 salsiccia; piatto di salsicce = 3 salsicce. Tre piatti di salsicce e
  // due grigliate devono chiedere alla griglia 11 salsicce, 4 costicine e
  // 1 pollo, in un'unica comanda.
  const componente = (id, nome, settore) => db.doc(`componenti/${id}`).set({ id, nome, settore });
  await componente('pollo', 'Pollo', 'griglia');
  await componente('salsiccia', 'Salsiccia', 'griglia');
  await componente('costicina', 'Costicina', 'griglia');
  await componente('patatine-porzione', 'Porzione di patatine', 'cucina');

  const piatto = (id, nome, composizione) =>
    db.doc(`prodotti/${id}`).set({
      id, nome, composizione,
      categoriaId: 'secondi', settore: 'griglia', note: '', prezzo: 10, novita: false, esauritoSerata: null, ordine: 90,
    });
  await piatto('grigliata-test', 'Grigliata mista', [
    { componenteId: 'costicina', quantita: 2 },
    { componenteId: 'pollo', quantita: 0.5 },
    { componenteId: 'salsiccia', quantita: 1 },
  ]);
  await piatto('piatto-salsicce', 'Piatto di salsicce', [{ componenteId: 'salsiccia', quantita: 3 }]);
  // Un piatto che fa lavorare due settori insieme.
  await piatto('grigliata-patatine', 'Grigliata con patatine', [
    { componenteId: 'costicina', quantita: 2 },
    { componenteId: 'patatine-porzione', quantita: 1 },
  ]);

  await accediCome('cassa');
  const ordineComposto = await assertOk(
    'ordine con piatti scomposti',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [
      { prodottoId: 'piatto-salsicce', quantita: 3 },
      { prodottoId: 'grigliata-test', quantita: 2 },
    ] })
  );
  const comandeComposte = (
    await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', ordineComposto.ordineId).get()
  ).docs.map((d) => d.data());
  record('i componenti tutti della griglia fanno una comanda sola', comandeComposte.length === 1, `comande: ${comandeComposte.length}`);
  const perComponente = Object.fromEntries((comandeComposte[0]?.componenti ?? []).map((c) => [c.id, c.quantita]));
  record('11 salsicce (3×3 + 2×1)', perComponente.salsiccia === 11, `salsicce: ${perComponente.salsiccia}`);
  record('4 costicine (2×2)', perComponente.costicina === 4, `costicine: ${perComponente.costicina}`);
  record('1 pollo (2×½)', perComponente.pollo === 1, `pollo: ${perComponente.pollo}`);
  record(
    'la comanda ricorda anche i piatti ordinati',
    (comandeComposte[0]?.items ?? []).length === 2,
    JSON.stringify(comandeComposte[0]?.items)
  );

  const ordineMisto = await assertOk(
    'ordine con un piatto che fa lavorare due settori',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'grigliata-patatine', quantita: 1 }] })
  );
  const comandeMiste = (
    await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', ordineMisto.ordineId).get()
  ).docs.map((d) => d.data());
  const allaGriglia = comandeMiste.find((c) => c.settore === 'griglia');
  const inCucina = comandeMiste.find((c) => c.settore === 'cucina');
  record('lo stesso piatto genera una comanda per ciascun settore', comandeMiste.length === 2, `comande: ${comandeMiste.length}`);
  record(
    'alla griglia vanno solo le costicine',
    allaGriglia?.componenti.length === 1 && allaGriglia.componenti[0].id === 'costicina' && allaGriglia.componenti[0].quantita === 2,
    JSON.stringify(allaGriglia?.componenti)
  );
  record(
    'in cucina va solo la porzione di patatine',
    inCucina?.componenti.length === 1 && inCucina.componenti[0].id === 'patatine-porzione',
    JSON.stringify(inCucina?.componenti)
  );

  // --- 15. Numero di comanda: lettera della cassa della persona ---------------
  const oggiItalia = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const dataAttesa = `${oggiItalia.year}${oggiItalia.month}${oggiItalia.day}`;

  await accediCome('cassa'); // lettera A
  const ordineA = await assertOk(
    'la cassiera A batte un ordine',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  record('il numero di comanda è A + quattro cifre', /^A\d{4}$/.test(ordineA.codice), `codice: ${ordineA.codice}`);
  const docA = (await db.doc(`serate/${SERATA_ID}/ordini/${ordineA.ordineId}`).get()).data();
  record(
    'il codice a barre contiene comanda, data, ora e cassa, solo lettere e cifre',
    new RegExp(`^${ordineA.codice}${dataAttesa}([01]\\d|2[0-3])[0-5]\\dA$`).test(docA.codiceBarre),
    `codice a barre: ${docA.codiceBarre}`
  );
  record('l’ordine ricorda la cassa, il tavolo e i coperti', docA.cassa === 'A' && docA.tavolo === 4 && docA.coperti === 2);
  const comandaA = (await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', ordineA.ordineId).get()).docs[0].data();
  record('la comanda del bar porta il numero di comanda', comandaA.codice === `B${ordineA.codice}`, `comanda: ${comandaA.codice}`);

  await accediCome('jolly'); // lettera B
  const ordineB = await assertOk(
    'la cassiera B batte un ordine',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  record('la cassa B ha la sua lettera', /^B\d{4}$/.test(ordineB.codice), `codice: ${ordineB.codice}`);

  await accediCome('cassa');
  const [paralleloA1, paralleloA2] = await Promise.all([
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
  ]);
  const numeriA = [paralleloA1.data.numero, paralleloA2.data.numero].sort((a, b) => a - b);
  record(
    'la stessa cassa, in parallelo, non ripete i numeri e non ne salta',
    numeriA[0] === ordineA.numero + 1 && numeriA[1] === ordineA.numero + 2,
    `dopo ${ordineA.codice}: ${paralleloA1.data.codice}, ${paralleloA2.data.codice}`
  );
  const serataDoc = (await db.doc(`serate/${SERATA_ID}`).get()).data();
  record('i progressivi delle casse sono separati', serataDoc.contatoriCassa.B === ordineB.numero && serataDoc.contatoriCassa.A === numeriA[1], JSON.stringify(serataDoc.contatoriCassa));

  await signOut(auth);
  const bozzaLettera = await creaOrdineBozza({ serataId: SERATA_ID, tavolo: 9, coperti: 3, items: [{ prodottoId: 'acqua', quantita: 1 }] });
  await accediCome('jolly');
  const confermaB = await assertOk(
    'un ordine dal QR confermato in cassa prende la lettera di chi incassa',
    confermaOrdine({ serataId: SERATA_ID, numero: bozzaLettera.data.numero })
  );
  record('…con il numero successivo della cassa B', confermaB.codice === `B${String(ordineB.numero + 1).padStart(4, '0')}`, `codice: ${confermaB.codice}`);

  await accediCome('cassa');
  await assertRifiutato(
    'senza tavolo l’ordine in cassa viene rifiutato',
    creaEInvia({ serataId: SERATA_ID, coperti: 2, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'invalid-argument'
  );
  await assertRifiutato(
    'senza coperti l’ordine in cassa viene rifiutato',
    creaEInvia({ serataId: SERATA_ID, tavolo: 3, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'invalid-argument'
  );

  const uidCassa = (await admin.auth().getUserByEmail('cassa@utenti.sagra-mazzocco.invalid')).uid;
  await assertRifiutato(
    'la cassa non può cambiarsi la lettera',
    impostaLetteraCassa({ uid: uidCassa, letteraCassa: 'Z' }),
    'permission-denied'
  );
  await accediCome('admin');
  await assertRifiutato('una lettera non valida viene rifiutata', impostaLetteraCassa({ uid: uidCassa, letteraCassa: 'AB' }), 'invalid-argument');
  await assertOk('l’amministratore toglie la lettera alla cassiera', impostaLetteraCassa({ uid: uidCassa, letteraCassa: null }));
  await accediCome('cassa');
  await assertRifiutato(
    'senza lettera la cassiera non può battere ordini',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] }),
    'failed-precondition'
  );
  await accediCome('admin');
  await assertOk('l’amministratore le assegna la lettera D', impostaLetteraCassa({ uid: uidCassa, letteraCassa: 'D' }));
  await accediCome('cassa'); // senza rientrare vale subito: non è un permesso
  const ordineD = await assertOk(
    'la nuova lettera vale da subito',
    creaEInvia({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  record('e la cassa D parte da 1', ordineD.codice === 'D0001', `codice: ${ordineD.codice}`);
  await accediCome('admin');
  await impostaLetteraCassa({ uid: uidCassa, letteraCassa: 'A' });

  // --- 16. La conferma fa tutto in una volta sola ---------------------------
  await accediCome('admin');
  await impostaPorzioni({ serataId: SERATA_ID, prodottoId: 'torta', porzioniMassime: 2 });

  await accediCome('cassa');
  const incassato = await assertOk(
    'la cassa conferma un ordine, a cliente già pagato',
    creaOrdineCassa({ serataId: SERATA_ID, tavolo: 8, coperti: 2, items: [{ prodottoId: 'torta', quantita: 2 }] })
  );
  const docIncassato = (await db.doc(`serate/${SERATA_ID}/ordini/${incassato.ordineId}`).get()).data();
  record(
    'l’ordine nasce già pagato e già in lavorazione',
    docIncassato.stato === 'in_evasione' && docIncassato.pagatoAt != null,
    `stato: ${docIncassato.stato}`
  );
  const comande = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', incassato.ordineId).get();
  record(
    'le comande sono già ai reparti, con il numero di comanda',
    comande.size === 1 && comande.docs[0].data().codice === `C${incassato.codice}`,
    comande.docs.map((d) => d.data().codice).join(', ')
  );
  const tortaVenduta = (await db.doc(`serate/${SERATA_ID}/disponibilita/torta`).get()).data();
  record('le porzioni sono scalate nella stessa operazione', tortaVenduta.venduti === 2, `venduti: ${tortaVenduta.venduti}`);
  const tortaFinita = (await db.doc('prodotti/torta').get()).data();
  record('con l’ultima porzione venduta il piatto risulta finito', tortaFinita.esauritoSerata === SERATA_ID);
  await assertRifiutato(
    'un’altra cassa non può vendere porzioni che non ci sono più',
    creaOrdineCassa({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'torta', quantita: 1 }] }),
    'failed-precondition'
  );

  // Un errore si scopre a ordine già partito: la cassa deve poterlo annullare
  // da sé, senza andare a cercare l'amministratore.
  await assertOk('la cassa annulla un ordine già partito', annullaOrdine({ serataId: SERATA_ID, ordineId: incassato.ordineId }));
  const tortaTornata = (await db.doc(`serate/${SERATA_ID}/disponibilita/torta`).get()).data();
  const tortaDiNuovo = (await db.doc('prodotti/torta').get()).data();
  record(
    'annullandolo le porzioni tornano vendibili',
    tortaTornata.venduti === 0 && tortaDiNuovo.esauritoSerata === null,
    `venduti: ${tortaTornata.venduti}, esaurito: ${tortaDiNuovo.esauritoSerata}`
  );
  await assertRifiutato(
    'un ordine annullato non si annulla due volte',
    annullaOrdine({ serataId: SERATA_ID, ordineId: incassato.ordineId }),
    'failed-precondition'
  );

  // Dal QR: la bozza confermata salta anche lei lo stato intermedio.
  await signOut(auth);
  const bozzaGiro = await creaOrdineBozza({ serataId: SERATA_ID, tavolo: 6, coperti: 4, items: [{ prodottoId: 'birra', quantita: 2 }] });
  await accediCome('cassa');
  const bozzaConfermata = await assertOk('la cassa conferma la bozza', confermaOrdine({ serataId: SERATA_ID, numero: bozzaGiro.data.numero }));
  const docBozza = (await db.doc(`serate/${SERATA_ID}/ordini/${bozzaConfermata.ordineId}`).get()).data();
  const comandeBozza = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', bozzaConfermata.ordineId).get();
  record(
    'la bozza confermata parte subito verso i reparti',
    docBozza.stato === 'in_evasione' && comandeBozza.size > 0 && /^A\d{4}$/.test(docBozza.codice),
    `stato: ${docBozza.stato}, comande: ${comandeBozza.size}, codice: ${docBozza.codice}`
  );
  await assertRifiutato(
    'la stessa bozza non si conferma due volte',
    confermaOrdine({ serataId: SERATA_ID, numero: bozzaGiro.data.numero }),
    'failed-precondition'
  );

  // --- 17. Distribuzione: copia cucina e lettura del codice a barre ---------
  await accediCome('cassa');
  const perVassoio = await assertOk(
    'la cassa batte un ordine da portare al tavolo',
    creaOrdineCassa({ serataId: SERATA_ID, tavolo: 9, coperti: 4, items: [{ prodottoId: 'acqua', quantita: 2 }] })
  );
  await assertRifiutato(
    'la cassa non gestisce la distribuzione',
    segnaCopiaCucinaStampata({ serataId: SERATA_ID, ordineId: perVassoio.ordineId }),
    'permission-denied'
  );

  await accediCome('distribuzione');
  const primaStampa = await assertOk(
    'la distribuzione si prende la stampa della copia cucina',
    segnaCopiaCucinaStampata({ serataId: SERATA_ID, ordineId: perVassoio.ordineId })
  );
  record('…e le tocca stamparla', primaStampa.daStampare === true);
  const secondaStampa = await assertOk(
    'una seconda richiesta per lo stesso ordine viene accettata',
    segnaCopiaCucinaStampata({ serataId: SERATA_ID, ordineId: perVassoio.ordineId })
  );
  record('…ma non fa uscire un secondo foglio', secondaStampa.daStampare === false);

  await assertRifiutato(
    'un testo qualsiasi non è un codice di comanda',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: 'ciao' }),
    'invalid-argument'
  );
  await assertRifiutato(
    'un foglio di un’altra serata non chiude gli ordini di stasera',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: 'Z9999200001011200Z' }),
    'not-found'
  );

  const ordineDaChiudere = (await db.doc(`serate/${SERATA_ID}/ordini/${perVassoio.ordineId}`).get()).data();
  const chiusura = await assertOk(
    'la lettura del codice a barre chiude l’ordine',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: ordineDaChiudere.codiceBarre })
  );
  record('la risposta dice dove portare il vassoio', chiusura.tavolo === 9 && chiusura.codice === ordineDaChiudere.codice);
  const dopoChiusura = (await db.doc(`serate/${SERATA_ID}/ordini/${perVassoio.ordineId}`).get()).data();
  record('l’ordine risulta completato', dopoChiusura.stato === 'completata' && dopoChiusura.completedAt != null);
  const comandeChiuse = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', perVassoio.ordineId)
    .get();
  record(
    'tutte le comande dell’ordine risultano consegnate',
    comandeChiuse.size > 0 && comandeChiuse.docs.every((d) => d.data().stato === 'consegnata'),
    comandeChiuse.docs.map((d) => `${d.data().codice}: ${d.data().stato}`).join(', ')
  );
  await assertRifiutato(
    'lo stesso foglio letto due volte avvisa e non fa danni',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: ordineDaChiudere.codiceBarre }),
    'failed-precondition'
  );

  // Un ordine annullato: il suo foglio non deve valere più niente.
  await accediCome('cassa');
  const daAnnullare = await assertOk(
    'la cassa conferma un ordine che poi annulla',
    creaOrdineCassa({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'acqua', quantita: 1 }] })
  );
  const foglioAnnullato = (await db.doc(`serate/${SERATA_ID}/ordini/${daAnnullare.ordineId}`).get()).data();
  await annullaOrdine({ serataId: SERATA_ID, ordineId: daAnnullare.ordineId });
  await accediCome('distribuzione');
  await assertRifiutato(
    'il foglio di un ordine annullato non chiude niente',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: foglioAnnullato.codiceBarre }),
    'failed-precondition'
  );


  // --- I banchi (BAR, BEVANDE) ---------------------------------------------
  // Vendono per conto loro: nessuna comanda ai reparti, nessuna porzione
  // scalata sul menù della sagra, e i prezzi li rilegge sempre il server.
  await accediCome('bancobar');
  const scontrino1 = await assertOk(
    'il banco BAR incassa un ordine',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'birra-piccola', quantita: 2 }] })
  );
  record(
    'lo scontrino prende il numero del banco (BAR0001)',
    scontrino1?.codice === 'BAR0001',
    `codice ricevuto: ${scontrino1?.codice}`
  );
  record('e il totale lo calcola il server', scontrino1?.totale === 6, `totale ricevuto: ${scontrino1?.totale}`);

  const scontrino2 = await assertOk(
    'il secondo scontrino prende il numero dopo',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'caffe', quantita: 1 }] })
  );
  record('la numerazione va avanti di uno', scontrino2?.codice === 'BAR0002', `codice: ${scontrino2?.codice}`);

  await assertRifiutato(
    'il banco BAR non incassa per BEVANDE',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bevande', items: [{ prodottoId: 'vino-bicchiere', quantita: 1 }] }),
    'permission-denied'
  );
  await assertRifiutato(
    'e non vende una voce del menù dell’altro banco',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'vino-bicchiere', quantita: 1 }] }),
    'not-found'
  );
  await assertRifiutato(
    'né un piatto del menù della sagra',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'pasta', quantita: 1 }] }),
    'not-found'
  );
  await assertRifiutato(
    'un ordine vuoto non si incassa',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [] }),
    'invalid-argument'
  );
  await assertRifiutato(
    'un banco inventato non esiste',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'gelati', items: [{ prodottoId: 'birra-piccola', quantita: 1 }] }),
    'invalid-argument'
  );

  // I due banchi hanno numerazioni separate: BEVANDE riparte da 1.
  await accediCome('bancobevande');
  const scontrinoBev = await assertOk(
    'il banco BEVANDE incassa il suo primo ordine',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bevande', items: [{ prodottoId: 'vino-caraffa', quantita: 1 }] })
  );
  record(
    'ogni banco ha la sua numerazione (BEV0001)',
    scontrinoBev?.codice === 'BEV0001',
    `codice ricevuto: ${scontrinoBev?.codice}`
  );

  await assertRifiutato(
    'il banco BEVANDE non annulla un incasso del BAR',
    annullaOrdineBanco({ serataId: SERATA_ID, ordineId: scontrino2.ordineId }),
    'permission-denied'
  );

  await accediCome('bancobar');
  await assertOk(
    'il banco annulla un proprio incasso sbagliato',
    annullaOrdineBanco({ serataId: SERATA_ID, ordineId: scontrino2.ordineId })
  );
  const annullato = await db.doc(`serate/${SERATA_ID}/ordiniBanco/${scontrino2.ordineId}`).get();
  record('l’ordine annullato resta in archivio', annullato.exists);
  record('ma segnato come annullato', annullato.data()?.stato === 'annullato', `stato: ${annullato.data()?.stato}`);
  await assertRifiutato(
    'annullarlo due volte non si può',
    annullaOrdineBanco({ serataId: SERATA_ID, ordineId: scontrino2.ordineId }),
    'failed-precondition'
  );

  // Gli ordini del banco non generano comande per i reparti: è la differenza
  // con la cassa dei tavoli, e vale la pena controllarla davvero.
  const sottoOrdiniBanco = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', scontrino1.ordineId)
    .get();
  record('un ordine del banco non manda comande ai reparti', sottoOrdiniBanco.empty);

  await accediCome('cassa');
  await assertRifiutato(
    'la cassa dei tavoli non incassa a un banco',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'birra-piccola', quantita: 1 }] }),
    'permission-denied'
  );

  // --- Le comande del bere che arrivano al banco BEVANDE --------------------
  // Un ordine dei tavoli col bere genera un sotto-ordine del settore bar: è
  // quello che al banco BEVANDE esce dalla stampante, una volta sola.
  const ordineColBere = await assertOk(
    'la cassa batte un ordine che contiene del bere',
    creaEInvia({ serataId: SERATA_ID, items: [{ prodottoId: 'birra', quantita: 2 }], ...TAVOLO })
  );
  const comandeBere = await db
    .collection(`serate/${SERATA_ID}/sottoOrdini`)
    .where('ordineId', '==', ordineColBere.ordineId)
    .where('settore', '==', 'bar')
    .get();
  record('ne nasce una comanda per il banco delle bevande', comandeBere.size === 1, `comande: ${comandeBere.size}`);

  if (comandeBere.size === 1) {
    const comandaId = comandeBere.docs[0].id;
    await accediCome('bancobevande');
    const primaStampa = await assertOk(
      'il banco BEVANDE si prende la stampa della comanda',
      segnaComandaStampata({ serataId: SERATA_ID, sottoOrdineId: comandaId })
    );
    record('e gli tocca stamparla', primaStampa?.daStampare === true);
    const secondaStampa = await assertOk(
      'un secondo schermo chiede la stessa comanda',
      segnaComandaStampata({ serataId: SERATA_ID, sottoOrdineId: comandaId })
    );
    record('ma il foglio esce una volta sola', secondaStampa?.daStampare === false);

    await accediCome('bancobar');
    await assertRifiutato(
      'il banco BAR non stampa le comande delle bevande',
      segnaComandaStampata({ serataId: SERATA_ID, sottoOrdineId: comandaId }),
      'permission-denied'
    );
  }


  // --- Le segnalazioni dai bagni -------------------------------------------
  // Le manda un cliente col telefono, senza aver fatto l'accesso.
  await signOut(auth);
  const seg1 = await assertOk(
    'un cliente segnala dal bagno, senza accesso',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'donne', tipo: 'sapone' })
  );
  record('la segnalazione e’ nuova', seg1?.giaSegnalata === false);

  const seg2 = await assertOk(
    'un secondo cliente segnala la stessa cosa',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'donne', tipo: 'sapone' })
  );
  record('non ne nasce una seconda', seg2?.giaSegnalata === true && seg2?.segnalazioneId === seg1?.segnalazioneId);

  const seg3 = await assertOk(
    'la stessa cosa in un altro bagno e’ un’altra segnalazione',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'uomini', tipo: 'sapone' })
  );
  record('e infatti ne nasce una nuova', seg3?.giaSegnalata === false && seg3?.segnalazioneId !== seg1?.segnalazioneId);

  await assertRifiutato(
    'un bagno che non esiste viene rifiutato',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'cucina', tipo: 'sapone' }),
    'invalid-argument'
  );
  await assertRifiutato(
    'e una segnalazione inventata pure',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'donne', tipo: 'incendio' }),
    'invalid-argument'
  );

  const salvata = (await db.doc(`serate/${SERATA_ID}/segnalazioni/${seg1.segnalazioneId}`).get()).data();
  record('la segnalazione salva il testo per esteso', salvata?.testo === 'Manca il sapone', `testo: ${salvata?.testo}`);
  record('e nasce da sistemare', salvata?.presaInCaricoAt === null);

  await assertRifiutato(
    'un cliente non può dire "ci penso io"',
    prendiSegnalazione({ serataId: SERATA_ID, segnalazioneId: seg1.segnalazioneId }),
    'unauthenticated'
  );

  // "Ci penso io" lo può premere chiunque stia lavorando, qualunque sia il suo
  // ruolo: portare un rotolo di carta non è il mestiere di nessuno in
  // particolare.
  await accediCome('cucina');
  await assertOk(
    'chi sta lavorando se ne prende carico, con qualsiasi ruolo',
    prendiSegnalazione({ serataId: SERATA_ID, segnalazioneId: seg1.segnalazioneId })
  );
  const presa = (await db.doc(`serate/${SERATA_ID}/segnalazioni/${seg1.segnalazioneId}`).get()).data();
  record('da quel momento risulta presa in carico', !!presa?.presaInCaricoAt);
  record('con il nome di chi ci va', presa?.presaInCaricoDa === 'Cuoco di prova', `nome: ${presa?.presaInCaricoDa}`);

  await accediCome('cassa');
  await assertOk(
    'se ci pensa un secondo per sbaglio, non è un errore',
    prendiSegnalazione({ serataId: SERATA_ID, segnalazioneId: seg1.segnalazioneId })
  );
  const ancora = (await db.doc(`serate/${SERATA_ID}/segnalazioni/${seg1.segnalazioneId}`).get()).data();
  record('e resta di chi se n’era preso carico per primo', ancora?.presaInCaricoDa === 'Cuoco di prova');

  // Una volta sistemata, la stessa cosa si può segnalare di nuovo: il sapone
  // può finire due volte nella stessa serata.
  await signOut(auth);
  const seg4 = await assertOk(
    'dopo che è stata sistemata, si può risegnalare',
    segnalaBagno({ serataId: SERATA_ID, bagno: 'donne', tipo: 'sapone' })
  );
  record('ed è una segnalazione nuova', seg4?.giaSegnalata === false && seg4?.segnalazioneId !== seg1?.segnalazioneId);

  // --- Contanti o POS -------------------------------------------------------
  // Senza questo, a fine serata non si sa quanto deve esserci nel cassetto.
  await accediCome('cassa');
  const ordineContanti = await assertOk(
    'un ordine pagato in contanti',
    creaEInvia({ serataId: SERATA_ID, items: [{ prodottoId: 'patatine', quantita: 1 }], ...TAVOLO, pagamento: 'contanti' })
  );
  const ordinePos = await assertOk(
    'un ordine pagato col POS',
    creaEInvia({ serataId: SERATA_ID, items: [{ prodottoId: 'patatine', quantita: 1 }], ...TAVOLO, pagamento: 'elettronico' })
  );
  const senzaMetodo = await assertOk(
    'un ordine che non dice come e’ stato pagato',
    creaEInvia({ serataId: SERATA_ID, items: [{ prodottoId: 'patatine', quantita: 1 }], ...TAVOLO })
  );
  const leggi = async (id) => (await db.doc(`serate/${SERATA_ID}/ordini/${id}`).get()).data();
  record('il contante resta scritto sull’ordine', (await leggi(ordineContanti.ordineId))?.pagamento === 'contanti');
  record('e il POS pure', (await leggi(ordinePos.ordineId))?.pagamento === 'elettronico');
  record('chi non lo dice paga in contanti', (await leggi(senzaMetodo.ordineId))?.pagamento === 'contanti');

  await assertRifiutato(
    'un metodo di pagamento inventato viene rifiutato',
    creaEInvia({ serataId: SERATA_ID, items: [{ prodottoId: 'patatine', quantita: 1 }], ...TAVOLO, pagamento: 'assegno' }),
    'invalid-argument'
  );

  await accediCome('bancobar');
  const scontrinoPos = await assertOk(
    'anche al banco si distingue il pagamento',
    creaOrdineBanco({ serataId: SERATA_ID, banco: 'bar', items: [{ prodottoId: 'caffe', quantita: 1 }], pagamento: 'elettronico' })
  );
  const scontrino = (await db.doc(`serate/${SERATA_ID}/ordiniBanco/${scontrinoPos.ordineId}`).get()).data();
  record('e resta scritto sullo scontrino del banco', scontrino?.pagamento === 'elettronico');
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
