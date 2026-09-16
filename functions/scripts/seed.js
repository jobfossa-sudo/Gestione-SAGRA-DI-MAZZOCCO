// Popola gli emulatori (Firestore + Authentication) con dati fittizi per le
// prove in locale. Va eseguito MENTRE gli emulatori sono avviati:
//
//   firebase emulators:exec --only firestore,auth "node functions/scripts/seed.js"
//
// Non tocca mai i dati reali (solo gli emulatori locali).

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

// Stessa conversione di emailDaNomeUtente() in shared/src/index.ts.
const emailDaNomeUtente = (nomeUtente) => `${nomeUtente}@utenti.sagra-mazzocco.invalid`;

const PASSWORD_PROVA = 'prova1234';

// Un account per ruolo, più uno senza alcun accesso per verificare che non
// possa fare nulla (come un account che qualcuno si fosse registrato da solo).
const UTENTI_PROVA = [
  { nomeUtente: 'admin', nome: 'Amministratore di prova', amministratore: true, accessi: {} },
  { nomeUtente: 'cassa', nome: 'Cassiera di prova', amministratore: false, accessi: { comande: ['cassa'] } },
  { nomeUtente: 'cucina', nome: 'Cuoco di prova', amministratore: false, accessi: { comande: ['cucina'] } },
  { nomeUtente: 'griglia', nome: 'Grigliere di prova', amministratore: false, accessi: { comande: ['griglia'] } },
  { nomeUtente: 'bar', nome: 'Barista di prova', amministratore: false, accessi: { comande: ['bar'] } },
  { nomeUtente: 'consegna', nome: 'Inserviente di prova', amministratore: false, accessi: { comande: ['consegna'] } },
  // Volontaria con due postazioni: verifica il caso dei ruoli multipli.
  { nomeUtente: 'jolly', nome: 'Volontaria tuttofare', amministratore: false, accessi: { comande: ['cassa', 'consegna'] } },
  { nomeUtente: 'senzaruolo', nome: 'Account senza accessi', amministratore: false, accessi: {} },
];

// Le portate del menù: da qui in poi le gestisce l'amministratore dall'app.
// Stesso elenco di CATEGORIE_INIZIALI in shared/src/index.ts.
const CATEGORIE_FITTIZIE = [
  { id: 'primi', nome: 'Primi', ordine: 0 },
  { id: 'secondi', nome: 'Secondi', ordine: 10 },
  { id: 'contorni', nome: 'Contorni', ordine: 20 },
  { id: 'bevande', nome: 'Bevande', ordine: 30 },
  { id: 'dessert', nome: 'Dessert', ordine: 40 },
];

// Le parti che i settori preparano davvero, ciascuna con il suo settore.
const COMPONENTI_FITTIZI = [
  { id: 'pollo', nome: 'Pollo', settore: 'griglia' },
  { id: 'salsiccia', nome: 'Salsiccia', settore: 'griglia' },
  { id: 'costicina', nome: 'Costicina', settore: 'griglia' },
  { id: 'pancetta', nome: 'Fetta di pancetta', settore: 'griglia' },
];

// categoriaId = sotto quale portata compare; settore = chi lo prepara se il
// piatto non ha composizione; ordine = la posizione dentro la portata.
const PRODOTTI_FITTIZI = [
  { id: 'pasta', categoriaId: 'primi', ordine: 0, settore: 'cucina', nome: 'Pasta al ragù', note: 'ragù di manzo, grana', prezzo: 7, novita: false, esauritoSerata: null },
  { id: 'gnocchi', categoriaId: 'primi', ordine: 10, settore: 'cucina', nome: 'Gnocchi al pomodoro', note: 'pomodoro e basilico', prezzo: 7, novita: true, esauritoSerata: null },
  {
    id: 'grigliata', categoriaId: 'secondi', ordine: 0, settore: 'griglia', nome: 'Grigliata mista', note: 'salsiccia, costine, pollo', prezzo: 10, novita: false, esauritoSerata: null,
    composizione: [{ componenteId: 'costicina', quantita: 2 }, { componenteId: 'pollo', quantita: 0.5 }, { componenteId: 'salsiccia', quantita: 1 }],
  },
  {
    id: 'panino', categoriaId: 'secondi', ordine: 10, settore: 'griglia', nome: 'Panino con salsiccia', note: '', prezzo: 5, novita: false, esauritoSerata: null,
    composizione: [{ componenteId: 'salsiccia', quantita: 1 }],
  },
  {
    id: 'pollo-griglia', categoriaId: 'secondi', ordine: 20, settore: 'griglia', nome: 'Pollo alla griglia', note: '', prezzo: 9, novita: false, esauritoSerata: null,
    composizione: [{ componenteId: 'pollo', quantita: 1 }],
  },
  { id: 'patatine', categoriaId: 'contorni', ordine: 0, settore: 'cucina', nome: 'Patatine fritte', note: '', prezzo: 3, novita: false, esauritoSerata: null },
  { id: 'acqua', categoriaId: 'bevande', ordine: 0, settore: 'bar', nome: 'Acqua', note: 'naturale o frizzante', prezzo: 1, novita: false, esauritoSerata: null },
  { id: 'birra', categoriaId: 'bevande', ordine: 10, settore: 'bar', nome: 'Birra', note: 'media, alla spina', prezzo: 3, novita: false, esauritoSerata: null },
  { id: 'vino', categoriaId: 'bevande', ordine: 20, settore: 'bar', nome: 'Vino (calice)', note: '', prezzo: 3, novita: false, esauritoSerata: null },
  { id: 'torta', categoriaId: 'dessert', ordine: 0, settore: 'cucina', nome: 'Torta di mele', note: 'fatta in casa', prezzo: 3, novita: false, esauritoSerata: null },
];

async function creaUtenteProva({ nomeUtente, nome, amministratore, accessi }) {
  const email = emailDaNomeUtente(nomeUtente);
  let uid;
  try {
    uid = (await admin.auth().getUserByEmail(email)).uid;
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    uid = (await admin.auth().createUser({ email, password: PASSWORD_PROVA, displayName: nome })).uid;
  }
  if (!amministratore && Object.keys(accessi).length === 0) return;
  await admin.auth().setCustomUserClaims(uid, { ...accessi, ...(amministratore ? { amministratore: true } : {}) });
  await db.doc(`utenti/${uid}`).set({
    uid,
    nomeUtente,
    nome,
    amministratore,
    accessi,
    attivo: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function main() {
  const oggi = new Date().toISOString().slice(0, 10);

  await db.collection('serate').doc(oggi).set({ id: oggi, data: oggi, aperta: true, contatoreOrdini: 0 });

  for (const categoria of CATEGORIE_FITTIZIE) {
    await db.collection('categorie').doc(categoria.id).set(categoria);
  }

  for (const componente of COMPONENTI_FITTIZI) {
    await db.collection('componenti').doc(componente.id).set(componente);
  }

  for (const prodotto of PRODOTTI_FITTIZI) {
    await db.collection('prodotti').doc(prodotto.id).set(prodotto);
  }

  for (const utente of UTENTI_PROVA) {
    await creaUtenteProva(utente);
  }

  console.log(
    `Seed completato: serata "${oggi}", ${CATEGORIE_FITTIZIE.length} portate, ${PRODOTTI_FITTIZI.length} prodotti, utenti di prova ` +
      `${UTENTI_PROVA.map((u) => u.nomeUtente).join(', ')} (password: ${PASSWORD_PROVA}).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
