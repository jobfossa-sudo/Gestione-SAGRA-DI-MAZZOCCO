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
const inviaOrdine = httpsCallable(functions, 'inviaOrdine');
const segnaCopiaCucinaStampata = httpsCallable(functions, 'segnaCopiaCucinaStampata');
const chiudiOrdine = httpsCallable(functions, 'chiudiOrdine');

/** Il giro completo della cassa: conferma (numero e resoconto), poi incasso e
 * invio ai reparti. Restituisce l'esito della conferma. */
async function creaEInvia(dati) {
  const conferma = await creaOrdineCassa(dati);
  await inviaOrdine({ serataId: dati.serataId, ordineId: conferma.data.ordineId });
  return conferma;
}

const SERATA_ID = new Date().toISOString().slice(0, 10);
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
  await assertOk('la cassa incassa e invia la bozza confermata', inviaOrdine({ serataId: SERATA_ID, ordineId: conferma1.ordineId }));

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

  // --- 16. Conferma, pagamento, invio ----------------------------------------
  await accediCome('admin');
  await impostaPorzioni({ serataId: SERATA_ID, prodottoId: 'torta', porzioniMassime: 2 });

  await accediCome('cassa');
  const daPagare = await assertOk(
    'la cassa conferma un ordine (numero e resoconto)',
    creaOrdineCassa({ serataId: SERATA_ID, tavolo: 8, coperti: 2, items: [{ prodottoId: 'torta', quantita: 2 }] })
  );
  const docDaPagare = (await db.doc(`serate/${SERATA_ID}/ordini/${daPagare.ordineId}`).get()).data();
  record('l’ordine confermato resta in attesa di pagamento', docDaPagare.stato === 'da_pagare', `stato: ${docDaPagare.stato}`);
  const comandePrima = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', daPagare.ordineId).get();
  record('prima dell’incasso non arriva nessuna comanda ai reparti', comandePrima.size === 0, `comande: ${comandePrima.size}`);
  const tortaTenuta = (await db.doc(`serate/${SERATA_ID}/disponibilita/torta`).get()).data();
  record('le porzioni sono già tenute da parte alla conferma', tortaTenuta.venduti === 2, `venduti: ${tortaTenuta.venduti}`);
  await assertRifiutato(
    'un’altra cassa non può vendere le porzioni tenute da parte',
    creaOrdineCassa({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'torta', quantita: 1 }] }),
    'failed-precondition'
  );

  await accediCome('cucina');
  await assertRifiutato(
    'la cucina non può inviare un ordine',
    inviaOrdine({ serataId: SERATA_ID, ordineId: daPagare.ordineId }),
    'permission-denied'
  );
  await accediCome('cassa');
  await assertOk('incassato: la cassa invia l’ordine', inviaOrdine({ serataId: SERATA_ID, ordineId: daPagare.ordineId }));
  const docInviato = (await db.doc(`serate/${SERATA_ID}/ordini/${daPagare.ordineId}`).get()).data();
  record('l’ordine inviato è in evasione e ricorda quando è stato pagato', docInviato.stato === 'in_evasione' && docInviato.pagatoAt != null);
  const comandeDopo = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', daPagare.ordineId).get();
  record(
    'dopo l’incasso la comanda arriva in cucina con il numero di comanda',
    comandeDopo.size === 1 && comandeDopo.docs[0].data().codice === `C${daPagare.codice}`,
    comandeDopo.docs.map((d) => d.data().codice).join(', ')
  );
  await assertRifiutato(
    'un ordine non si invia due volte',
    inviaOrdine({ serataId: SERATA_ID, ordineId: daPagare.ordineId }),
    'failed-precondition'
  );
  const comandeDoppie = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', daPagare.ordineId).get();
  record('…e le comande non si duplicano', comandeDoppie.size === 1);
  await assertRifiutato(
    'la cassa non può annullare un ordine già incassato',
    annullaOrdine({ serataId: SERATA_ID, ordineId: daPagare.ordineId }),
    'permission-denied'
  );

  // Il cliente se ne va senza pagare.
  await accediCome('admin');
  await impostaPorzioni({ serataId: SERATA_ID, prodottoId: 'torta', porzioniMassime: 3 });
  await accediCome('cassa');
  const abbandonato = await assertOk(
    'la cassa conferma un ordine che non verrà pagato',
    creaOrdineCassa({ serataId: SERATA_ID, ...TAVOLO, items: [{ prodottoId: 'torta', quantita: 1 }] })
  );
  const tortaFinita = (await db.doc('prodotti/torta').get()).data();
  record('con l’ultima porzione tenuta da parte il piatto risulta finito', tortaFinita.esauritoSerata === SERATA_ID);
  await assertOk('la cassa annulla l’ordine non pagato', annullaOrdine({ serataId: SERATA_ID, ordineId: abbandonato.ordineId }));
  const tortaLiberata = (await db.doc(`serate/${SERATA_ID}/disponibilita/torta`).get()).data();
  const tortaDiNuovo = (await db.doc('prodotti/torta').get()).data();
  record(
    'annullandolo la porzione torna vendibile',
    tortaLiberata.venduti === 2 && tortaDiNuovo.esauritoSerata === null,
    `venduti: ${tortaLiberata.venduti}, esaurito: ${tortaDiNuovo.esauritoSerata}`
  );
  await assertRifiutato(
    'un ordine annullato non si può inviare',
    inviaOrdine({ serataId: SERATA_ID, ordineId: abbandonato.ordineId }),
    'failed-precondition'
  );

  // Dal QR: la bozza confermata segue lo stesso giro.
  await signOut(auth);
  const bozzaGiro = await creaOrdineBozza({ serataId: SERATA_ID, tavolo: 6, coperti: 4, items: [{ prodottoId: 'birra', quantita: 2 }] });
  await accediCome('cassa');
  await assertRifiutato(
    'una bozza non ancora confermata non si può inviare',
    inviaOrdine({ serataId: SERATA_ID, ordineId: bozzaGiro.data.ordineId }),
    'failed-precondition'
  );
  const bozzaConfermata = await assertOk('la cassa conferma la bozza', confermaOrdine({ serataId: SERATA_ID, numero: bozzaGiro.data.numero }));
  const docBozza = (await db.doc(`serate/${SERATA_ID}/ordini/${bozzaConfermata.ordineId}`).get()).data();
  const comandeBozza = await db.collection(`serate/${SERATA_ID}/sottoOrdini`).where('ordineId', '==', bozzaConfermata.ordineId).get();
  record(
    'la bozza confermata aspetta il pagamento, senza comande',
    docBozza.stato === 'da_pagare' && comandeBozza.size === 0 && /^A\d{4}$/.test(docBozza.codice),
    `stato: ${docBozza.stato}, comande: ${comandeBozza.size}, codice: ${docBozza.codice}`
  );

  // --- 17. Distribuzione: copia cucina e lettura del codice a barre ---------
  await accediCome('cassa');
  const perVassoio = await assertOk(
    'la cassa batte un ordine da portare al tavolo',
    creaOrdineCassa({ serataId: SERATA_ID, tavolo: 9, coperti: 4, items: [{ prodottoId: 'acqua', quantita: 2 }] })
  );
  const letturaPrimaDelPagamento = (
    await db.doc(`serate/${SERATA_ID}/ordini/${perVassoio.ordineId}`).get()
  ).data();

  await accediCome('distribuzione');
  await assertRifiutato(
    'la copia cucina non esce per un ordine non pagato',
    segnaCopiaCucinaStampata({ serataId: SERATA_ID, ordineId: perVassoio.ordineId }),
    'failed-precondition'
  );
  await assertRifiutato(
    'un foglio non pagato non chiude niente',
    chiudiOrdine({ serataId: SERATA_ID, codiceBarre: letturaPrimaDelPagamento.codiceBarre }),
    'failed-precondition'
  );

  await accediCome('cassa');
  await inviaOrdine({ serataId: SERATA_ID, ordineId: perVassoio.ordineId });
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
