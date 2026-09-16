import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import type { DisponibilitaProdotto, Ordine, Permessi, Prodotto } from '@sagra-mazzocco/shared';
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

/** Tutto il menù, aggiornato in tempo reale. I piatti finiti restano
 * nell'elenco: vanno mostrati barrati, non nascosti. */
export function useProdotti(): Prodotto[] {
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'prodotti'), orderBy('nome')), (snapshot) => {
        setProdotti(snapshot.docs.map((doc) => doc.data() as Prodotto));
      }),
    []
  );

  return prodotti;
}

/** Porzioni massime e vendute della serata di oggi, per prodotto. Leggibile
 * solo dal personale. */
export function useDisponibilita(): Map<string, DisponibilitaProdotto> {
  const [disponibilita, setDisponibilita] = useState(new Map<string, DisponibilitaProdotto>());

  useEffect(
    () =>
      onSnapshot(collection(db, `serate/${SERATA_ID_OGGI}/disponibilita`), (snapshot) => {
        setDisponibilita(
          new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as DisponibilitaProdotto]))
        );
      }),
    []
  );

  return disponibilita;
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
