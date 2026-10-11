import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { confrontaPersone, type Permessi, type Utente } from '@sagra-mazzocco/shared';
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

/** Elenco di tutte le persone, per cognome, aggiornato in tempo reale. Le
 * regole di Firestore lo rendono leggibile solo all'amministratore (e al
 * contabile). Si ordina qui e non nella richiesta: i profili di prima non
 * hanno il cognome, e Firestore li lascerebbe fuori. */
export function useUtenti(): Utente[] {
  const [utenti, setUtenti] = useState<Utente[]>([]);

  useEffect(() => {
    return onSnapshot(collection(db, 'utenti'), (snapshot) =>
      setUtenti(snapshot.docs.map((doc) => doc.data() as Utente).sort(confrontaPersone))
    );
  }, []);

  return utenti;
}
