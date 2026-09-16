import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

// Stesso progetto Firebase delle altre app: gli account creati qui valgono
// ovunque. La configurazione è pubblica e sicura da includere nel client.
const app = initializeApp({
  apiKey: 'AIzaSyD-Zlw4oJ-eCSM6dF0UhkrbCzEq4iqy3VQ',
  authDomain: 'gestione-sagra-mazzocco.firebaseapp.com',
  projectId: 'gestione-sagra-mazzocco',
  storageBucket: 'gestione-sagra-mazzocco.firebasestorage.app',
  messagingSenderId: '135106723676',
  appId: '1:135106723676:web:2d5043dd06e160de774b99',
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// In sviluppo ci si collega sempre agli emulatori locali, mai ai dati reali.
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
