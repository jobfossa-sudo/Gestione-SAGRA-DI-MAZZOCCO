import { collection, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Edizione } from '@sagra-mazzocco/shared';
import { db } from './services/firebase';

/** Le edizioni (di norma una sola), aggiornate in tempo reale. Null finché
 * il server non ha risposto: "nessuna edizione" e "non ancora arrivate" sono
 * due cose diverse, e la prima fa comparire il modulo per crearla. Va montato
 * dopo l'accesso: un ascolto partito prima viene rifiutato e non riprova. */
export function useEdizioni(): Edizione[] | null {
  const [edizioni, setEdizioni] = useState<Edizione[] | null>(null);

  useEffect(
    () =>
      onSnapshot(
        collection(db, 'edizioni'),
        (snapshot) => setEdizioni(snapshot.docs.map((doc) => doc.data() as Edizione)),
        // Chi non può leggerla non vede né l'edizione né il modulo.
        () => setEdizioni(null)
      ),
    []
  );

  return edizioni;
}
