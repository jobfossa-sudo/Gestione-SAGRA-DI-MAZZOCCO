import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { confrontaPersone, edizioneAperta, type Edizione, type Permessi, type Utente } from '@sagra-mazzocco/shared';
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

/** L'edizione aperta (di norma l'unica che c'è). `caricata` è falso finché
 * il server non ha risposto. Va montato dopo l'accesso: un ascolto partito
 * prima viene rifiutato e non riprova. */
export function useEdizioneAperta(): { edizione: Edizione | null; caricata: boolean } {
  const [stato, setStato] = useState<{ edizione: Edizione | null; caricata: boolean }>({ edizione: null, caricata: false });

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'edizioni'),
        (snapshot) =>
          setStato({ edizione: edizioneAperta(snapshot.docs.map((doc) => doc.data() as Edizione)), caricata: true }),
        () => setStato({ edizione: null, caricata: true })
      ),
    []
  );

  return stato;
}
