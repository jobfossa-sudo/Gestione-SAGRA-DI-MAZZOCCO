// Prepara il progetto Firebase REALE (non l'emulatore): crea il primo
// amministratore, carica i prodotti del menu di esempio e apre la serata di
// oggi. Da eseguire dalla radice del repo, una volta sola:
//
//   node functions/scripts/setup-produzione.js <codice> <nomeUtente> <password> "<Nome e cognome>"
//
// <codice> è CODICE_INIZIALIZZAZIONE, configurato per le funzioni in
// functions/.env.gestione-sagra-mazzocco (file escluso da GitHub) prima del
// deploy. Codice e password si passano da riga di comando apposta: non vanno
// mai scritti dentro un file del progetto.
//
// ATTENZIONE: questo script scrive sui dati VERI, non sull'emulatore.

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc } = require('firebase/firestore');
const { getFunctions, httpsCallable } = require('firebase/functions');

const [codice, nomeUtente, password, nome] = process.argv.slice(2);
if (!codice || !nomeUtente || !password || !nome) {
  console.error('Uso: node functions/scripts/setup-produzione.js <codice> <nomeUtente> <password> "<Nome e cognome>"');
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

// Stessa conversione di emailDaNomeUtente() in shared/src/index.ts.
const email = `${nomeUtente.trim().toLowerCase()}@utenti.sagra-mazzocco.invalid`;

// Le portate con cui parte il menù. Si rinominano, si riordinano e se ne
// creano di nuove dall'app: questo è solo il punto di partenza.
const CATEGORIE = [
  { id: 'primi', nome: 'Primi', ordine: 0 },
  { id: 'secondi', nome: 'Secondi', ordine: 10 },
  { id: 'contorni', nome: 'Contorni', ordine: 20 },
  { id: 'bevande', nome: 'Bevande', ordine: 30 },
  { id: 'dessert', nome: 'Dessert', ordine: 40 },
];

// Menu di esempio: va sostituito con il menu vero della sagra.
// categoriaId = sotto quale portata compare; settore = chi lo prepara.
const PRODOTTI = [
  { id: 'pasta', categoriaId: 'primi', ordine: 0, settore: 'cucina', nome: 'Pasta al ragù', note: 'ragù di manzo, grana', prezzo: 7, novita: false, esauritoSerata: null },
  { id: 'grigliata', categoriaId: 'secondi', ordine: 0, settore: 'griglia', nome: 'Grigliata mista', note: 'salsiccia, costine, pancetta', prezzo: 10, novita: false, esauritoSerata: null },
  { id: 'panino', categoriaId: 'secondi', ordine: 10, settore: 'griglia', nome: 'Panino con salsiccia', note: '', prezzo: 5, novita: false, esauritoSerata: null },
  { id: 'patatine', categoriaId: 'contorni', ordine: 0, settore: 'cucina', nome: 'Patatine fritte', note: '', prezzo: 3, novita: false, esauritoSerata: null },
  { id: 'acqua', categoriaId: 'bevande', ordine: 0, settore: 'bar', nome: 'Acqua', note: 'naturale o frizzante', prezzo: 1, novita: false, esauritoSerata: null },
  { id: 'birra', categoriaId: 'bevande', ordine: 10, settore: 'bar', nome: 'Birra', note: 'media, alla spina', prezzo: 3, novita: false, esauritoSerata: null },
  { id: 'vino', categoriaId: 'bevande', ordine: 20, settore: 'bar', nome: 'Vino (calice)', note: '', prezzo: 3, novita: false, esauritoSerata: null },
];

/** Stessa regola di idSerata() in shared/src/index.ts: fino alle due di notte
 * si sta ancora nella serata di ieri. */
function idSerata(momento = new Date()) {
  const spostato = new Date(momento.getTime() - 2 * 60 * 60 * 1000);
  const anno = spostato.getFullYear();
  const mese = String(spostato.getMonth() + 1).padStart(2, '0');
  const giorno = String(spostato.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

async function main() {
  const inizializzaSistema = httpsCallable(functions, 'inizializzaSistema');
  try {
    await inizializzaSistema({ codice, nomeUtente, nome, password });
    console.log(`Creato l'amministratore "${nomeUtente}".`);
  } catch (err) {
    if (err.code !== 'functions/failed-precondition') throw err;
    console.log('Sistema già inizializzato: uso l’account indicato, che deve essere un amministratore.');
  }

  await signInWithEmailAndPassword(auth, email, password);

  for (const categoria of CATEGORIE) {
    await setDoc(doc(db, 'categorie', categoria.id), categoria);
  }
  for (const prodotto of PRODOTTI) {
    await setDoc(doc(db, 'prodotti', prodotto.id), prodotto);
  }
  console.log(`Caricate ${CATEGORIE.length} portate e ${PRODOTTI.length} prodotti nel menu.`);

  const oggi = idSerata();
  const risultato = await httpsCallable(functions, 'apriSerata')({ data: oggi });
  console.log(risultato.data.giaEsistente ? `La serata ${oggi} era già aperta.` : `Serata ${oggi} aperta.`);

  console.log('\nSetup completato.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Errore durante il setup:', err.message ?? err);
  process.exit(1);
});
