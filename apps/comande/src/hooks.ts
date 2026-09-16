import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { Ordine, Permessi, Prodotto } from '@sagra-mazzocco/shared';
import { auth, db } from './services/firebase';
import { SERATA_ID_OGGI } from './services/serata';

/** I permessi arrivano dalle custom claims del token: servono qui solo per
 * decidere cosa mostrare. Il controllo vero lo fanno funzioni e regole. */
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

export function useProdottiDisponibili(): Prodotto[] {
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'prodotti'), where('disponibile', '==', true));
    return onSnapshot(q, (snapshot) => {
      setProdotti(snapshot.docs.map((doc) => doc.data() as Prodotto));
    });
  }, []);

  return prodotti;
}

/** Ordini della serata di oggi ancora "aperti": bozze mai confermate e ordini
 * pagati non ancora completati. Usata dalla vista di fine serata. */
export function useOrdiniAperti(): Ordine[] {
  const [ordini, setOrdini] = useState<Ordine[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `serate/${SERATA_ID_OGGI}/ordini`),
      where('stato', 'in', ['bozza', 'in_evasione']),
      orderBy('numero')
    );
    return onSnapshot(q, (snapshot) => {
      setOrdini(snapshot.docs.map((doc) => doc.data() as Ordine));
    });
  }, []);

  return ordini;
}
