import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

// Configurazione pubblica del progetto Firebase "gestione-sagra-mazzocco":
// sicura da includere nel codice client (non è un segreto).
const app = initializeApp({
  apiKey: 'AIzaSyD-Zlw4oJ-eCSM6dF0UhkrbCzEq4iqy3VQ',
  authDomain: 'gestione-sagra-mazzocco.firebaseapp.com',
  projectId: 'gestione-sagra-mazzocco',
  storageBucket: 'gestione-sagra-mazzocco.firebasestorage.app',
  messagingSenderId: '135106723676',
  appId: '1:135106723676:web:2d5043dd06e160de774b99',
});

export const auth = getAuth(app);

// Copia locale dei dati: se la rete della sagra fa le bizze, menù, pannelli
// ed elenchi restano leggibili e si riallineano da soli al ritorno del
// collegamento. Vale per la lettura: gli ordini passano dalle Cloud Functions,
// che senza rete non si possono chiamare (vedi l'avviso in cima all'app).
// `persistentMultipleTabManager` serve perché in cassa si tengono aperte più
// finestre della stessa app.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

export const functions = getFunctions(app);

// In sviluppo (npm run dev) ci si collega sempre agli emulatori locali, mai
// ai dati reali. `npm run build` (usato da Netlify) non definisce import.meta.env.DEV,
// quindi il sito pubblicato parla sempre con il vero Firebase.
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
