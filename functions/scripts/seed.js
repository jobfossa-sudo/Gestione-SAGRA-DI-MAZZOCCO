// Popola l'emulatore Firestore con dati fittizi per i test degli step
// successivi. Va eseguito MENTRE l'emulatore Firestore è avviato:
//
//   firebase emulators:exec --only firestore "node functions/scripts/seed.js"
//
// Non tocca mai il database reale (solo l'emulatore locale).

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'gestione-sagra-mazzocco' });
const db = admin.firestore();

const CASSIERE_TEST = { email: 'cassiere@sagra.test', password: 'test1234' };

const PRODOTTI_FITTIZI = [
  { id: 'panino', nome: 'Panino', prezzo: 5, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'pasta', nome: 'Pasta al ragù', prezzo: 7, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'grigliata', nome: 'Grigliata mista', prezzo: 10, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'acqua', nome: 'Acqua', prezzo: 1, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
  { id: 'birra', nome: 'Birra', prezzo: 3, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
  { id: 'vino', nome: 'Vino (calice)', prezzo: 3, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
];

async function main() {
  const oggi = new Date().toISOString().slice(0, 10);

  await db.collection('serate').doc(oggi).set({
    data: oggi,
    aperta: true,
    contatoreOrdini: 0,
  });

  for (const prodotto of PRODOTTI_FITTIZI) {
    await db.collection('prodotti').doc(prodotto.id).set(prodotto);
  }

  try {
    await admin.auth().getUserByEmail(CASSIERE_TEST.email);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    await admin.auth().createUser(CASSIERE_TEST);
  }

  console.log(
    `Seed completato: serata "${oggi}" + ${PRODOTTI_FITTIZI.length} prodotti fittizi + utente cassiere di test (${CASSIERE_TEST.email} / ${CASSIERE_TEST.password}).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
