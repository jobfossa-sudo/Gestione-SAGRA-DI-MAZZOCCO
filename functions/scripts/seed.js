// Popola gli emulatori (Firestore + Authentication) con dati fittizi per le
// prove in locale. Va eseguito MENTRE gli emulatori sono avviati:
//
//   firebase emulators:exec --only firestore,auth "node functions/scripts/seed.js"
//
// Non tocca mai i dati reali (solo gli emulatori locali).

// Le porte le decide chi lancia lo script: il sistema di tutti i giorni usa
// quelle di firebase.json, le prove delle funzioni quelle di
// firebase.prove.json, così non si pestano i piedi.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

// Stessa conversione di emailDaNomeUtente() in shared/src/index.ts.
const emailDaNomeUtente = (nomeUtente) => `${nomeUtente}@utenti.sagra-mazzocco.invalid`;

// Stessa regola di idSerata() in shared/src/index.ts: fino alle due di notte
// si sta ancora nella serata di ieri.
function idSerata(momento = new Date()) {
  const spostato = new Date(momento.getTime() - 2 * 60 * 60 * 1000);
  const anno = spostato.getFullYear();
  const mese = String(spostato.getMonth() + 1).padStart(2, '0');
  const giorno = String(spostato.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

const PASSWORD_PROVA = 'prova1234';

// Un account per ruolo, più uno senza alcun accesso per verificare che non
// possa fare nulla (come un account che qualcuno si fosse registrato da solo).
const UTENTI_PROVA = [
  { nomeUtente: 'admin', nome: 'Amministratore di prova', amministratore: true, accessi: {}, letteraCassa: 'A' },
  { nomeUtente: 'cassa', nome: 'Cassiera di prova', amministratore: false, accessi: { comande: ['cassa'] }, letteraCassa: 'A' },
  { nomeUtente: 'cucina', nome: 'Cuoco di prova', amministratore: false, accessi: { comande: ['cucina'] } },
  { nomeUtente: 'griglia', nome: 'Grigliere di prova', amministratore: false, accessi: { comande: ['griglia'] } },
  { nomeUtente: 'bar', nome: 'Barista di prova', amministratore: false, accessi: { comande: ['bar'] } },
  { nomeUtente: 'distribuzione', nome: 'Addetto alla distribuzione', amministratore: false, accessi: { comande: ['distribuzione'] } },
  { nomeUtente: 'bancobar', nome: 'Addetto al banco BAR', amministratore: false, accessi: { comande: ['bancoBar'] } },
  { nomeUtente: 'bancobevande', nome: 'Addetto al banco BEVANDE', amministratore: false, accessi: { comande: ['bancoBevande'] } },
  // Volontaria con due postazioni: verifica il caso dei ruoli multipli.
  { nomeUtente: 'jolly', nome: 'Volontaria tuttofare', amministratore: false, accessi: { comande: ['cassa', 'distribuzione'] }, letteraCassa: 'B' },
  { nomeUtente: 'contabile', nome: 'Contabile di prova', amministratore: false, accessi: { contabilita: ['contabile'] } },
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

// Il menù dei banchi: se lo gestisce chi ci lavora, non l'amministratore.
// Qui ci sono solo due gruppi e poche voci per poter provare le schermate.
const MENU_BANCHI = {
  bar: {
    categorie: [
      { id: 'birre', nome: 'Birre', ordine: 0 },
      { id: 'caffetteria', nome: 'Caffetteria', ordine: 10 },
    ],
    prodotti: [
      { id: 'birra-piccola', categoriaId: 'birre', ordine: 0, nome: 'Birra piccola', note: '0,2 l alla spina', prezzo: 3, esauritoSerata: null },
      { id: 'birra-grande', categoriaId: 'birre', ordine: 10, nome: 'Birra grande', note: '0,4 l alla spina', prezzo: 5, esauritoSerata: null },
      { id: 'caffe', categoriaId: 'caffetteria', ordine: 0, nome: 'Caffè', note: '', prezzo: 1.2, esauritoSerata: null },
      { id: 'amaro', categoriaId: 'caffetteria', ordine: 10, nome: 'Amaro', note: 'della casa', prezzo: 3, esauritoSerata: null },
    ],
  },
  bevande: {
    categorie: [
      { id: 'analcolici', nome: 'Analcolici', ordine: 0 },
      { id: 'vini', nome: 'Vini', ordine: 10 },
    ],
    prodotti: [
      { id: 'acqua-banco', categoriaId: 'analcolici', ordine: 0, nome: 'Acqua 0,5 l', note: 'naturale o frizzante', prezzo: 1, esauritoSerata: null },
      { id: 'bibita', categoriaId: 'analcolici', ordine: 10, nome: 'Bibita in lattina', note: '', prezzo: 2.5, esauritoSerata: null },
      { id: 'vino-bicchiere', categoriaId: 'vini', ordine: 0, nome: 'Vino al bicchiere', note: 'rosso o bianco', prezzo: 2, esauritoSerata: null },
      { id: 'vino-caraffa', categoriaId: 'vini', ordine: 10, nome: 'Vino in caraffa', note: '1 litro', prezzo: 6, esauritoSerata: null },
    ],
  },
};

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

async function creaUtenteProva({ nomeUtente, nome, amministratore, accessi, letteraCassa = null }) {
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
    letteraCassa,
    attivo: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function main() {
  const oggi = idSerata();

  // La serata si crea se non c'è, ma NON si riscrive se c'è già: rilanciare il
  // seed a metà giornata riazzerava i contatori, e i numeri di comanda
  // ripartivano da capo sopra ordini che esistevano ancora — due A0001 nella
  // stessa serata, e la ricerca per codice ne trovava due.
  const serataRef = db.collection('serate').doc(oggi);
  if (!(await serataRef.get()).exists) {
    await serataRef.set({ id: oggi, data: oggi, aperta: true, contatoreOrdini: 0, contatoriCassa: {}, contatoriBanco: {} });
  }

  for (const [banco, menu] of Object.entries(MENU_BANCHI)) {
    for (const categoria of menu.categorie) {
      await db.doc(`banchi/${banco}/categorie/${categoria.id}`).set(categoria);
    }
    for (const prodotto of menu.prodotti) {
      await db.doc(`banchi/${banco}/prodotti/${prodotto.id}`).set(prodotto);
    }
  }

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
