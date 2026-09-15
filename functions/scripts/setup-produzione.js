// Prepara il progetto Firebase REALE (non l'emulatore) per poter usare l'app:
// crea l'account del personale di cassa, carica i prodotti del menu e apre la
// serata di oggi. Da eseguire dalla radice del repo:
//
//   node functions/scripts/setup-produzione.js <email> <password>
//
// Email e password si passano da riga di comando apposta: non vanno mai
// scritte dentro un file del progetto (finirebbero su GitHub).
//
// ATTENZIONE: questo script scrive sui dati VERI, non sull'emulatore.

const { initializeApp } = require('firebase/app');
const {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { getFunctions, httpsCallable } = require('firebase/functions');

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Uso: node functions/scripts/setup-produzione.js <email> <password>');
  process.exit(1);
}

const app = initializeApp({
  apiKey: 'AIzaSyD-Zlw4oJ-eCSM6dF0UhkrbCzEq4iqy3VQ',
  authDomain: 'gestione-sagra-mazzocco.firebaseapp.com',
  projectId: 'gestione-sagra-mazzocco',
  storageBucket: 'gestione-sagra-mazzocco.firebasestorage.app',
  messagingSenderId: '135106723676',
  appId: '1:135106723676:web:2d5043dd06e160de774b99',
});

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// Menu di esempio: va sostituito con il menu vero della sagra quando sarà
// deciso. I prezzi qui sono quelli che l'app userà per i conti.
const PRODOTTI = [
  { id: 'panino', nome: 'Panino', prezzo: 5, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'pasta', nome: 'Pasta al ragù', prezzo: 7, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'grigliata', nome: 'Grigliata mista', prezzo: 10, reparto: 'cucina', disponibile: true, categoria: 'Cucina' },
  { id: 'acqua', nome: 'Acqua', prezzo: 1, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
  { id: 'birra', nome: 'Birra', prezzo: 3, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
  { id: 'vino', nome: 'Vino (calice)', prezzo: 3, reparto: 'bevande', disponibile: true, categoria: 'Bevande' },
];

async function accedi() {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log(`Accesso eseguito con l'account esistente ${email}.`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found' && err.code !== 'auth/invalid-credential') throw err;
    await createUserWithEmailAndPassword(auth, email, password);
    console.log(`Creato il nuovo account ${email}.`);
  }
}

async function main() {
  await accedi();

  for (const prodotto of PRODOTTI) {
    await setDoc(doc(db, 'prodotti', prodotto.id), prodotto);
  }
  console.log(`Caricati ${PRODOTTI.length} prodotti nel menu.`);

  const oggi = new Date().toISOString().slice(0, 10);
  const apriSerata = httpsCallable(functions, 'apriSerata');
  const risultato = await apriSerata({ data: oggi });
  console.log(
    risultato.data.giaEsistente
      ? `La serata ${oggi} era già aperta.`
      : `Serata ${oggi} aperta, numerazione ordini che riparte da 1.`
  );

  console.log('\nSetup completato: il sito pubblicato è pronto all\'uso.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore durante il setup:', err.message ?? err);
  process.exit(1);
});
