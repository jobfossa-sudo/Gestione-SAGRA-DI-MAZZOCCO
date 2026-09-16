import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Permessi, Utente } from '@sagra-mazzocco/shared';
import { auth, db } from './services/firebase';

export function useUtenteAutenticato(): { utente: User | null; permessi: Permessi; caricato: boolean } {
  const [stato, setStato] = useState<{ utente: User | null; permessi: Permessi; caricato: boolean }>({
    utente: null,
    permessi: {},
    caricato: false,
  });

  useEffect(
    () =>
      onAuthStateChanged(auth, async (utente) => {
        const permessi = utente ? ((await utente.getIdTokenResult()).claims as Permessi) : {};
        setStato({ utente, permessi, caricato: true });
      }),
    []
  );

  return stato;
}

/** Elenco di tutti gli utenti, aggiornato in tempo reale. Le regole di
 * Firestore lo rendono leggibile solo all'amministratore. */
export function useUtenti(): Utente[] {
  const [utenti, setUtenti] = useState<Utente[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'utenti'), orderBy('nome'));
    return onSnapshot(q, (snapshot) => setUtenti(snapshot.docs.map((doc) => doc.data() as Utente)));
  }, []);

  return utenti;
}
