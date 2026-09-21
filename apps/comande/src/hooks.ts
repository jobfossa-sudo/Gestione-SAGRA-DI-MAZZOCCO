import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { BIGLIETTI_INIZIALI, TIPI_BIGLIETTO } from '@sagra-mazzocco/shared';
import type {
  Biglietto,
  TipoBiglietto,
  Immagine,
  Categoria,
  Componente,
  DisponibilitaProdotto,
  Ordine,
  Permessi,
  Prodotto,
  SottoOrdine,
  Utente,
} from '@sagra-mazzocco/shared';
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

/** La lettera di cassa di chi è collegato, dal suo profilo: undefined finché
 * non arriva, null se non ne ha una. Si aggiorna da sola se l'amministratore
 * la cambia. */
export function useLetteraCassa(uid: string | undefined): string | null | undefined {
  const [lettera, setLettera] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(db, 'utenti', uid),
      (snapshot) => setLettera((snapshot.data() as Utente | undefined)?.letteraCassa ?? null),
      () => setLettera(null)
    );
  }, [uid]);

  return lettera;
}

/** Le portate del menù, nell'ordine deciso dall'amministratore. */
export function useCategorie(): Categoria[] {
  const [categorie, setCategorie] = useState<Categoria[]>([]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'categorie'), orderBy('ordine')), (snapshot) => {
        setCategorie(snapshot.docs.map((doc) => doc.data() as Categoria));
      }),
    []
  );

  return categorie;
}

/** I componenti dei piatti, in ordine alfabetico. */
export function useComponenti(): Componente[] {
  const [componenti, setComponenti] = useState<Componente[]>([]);

  useEffect(
    () =>
      onSnapshot(collection(db, 'componenti'), (snapshot) => {
        const elenco = snapshot.docs.map((doc) => doc.data() as Componente);
        elenco.sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
        setComponenti(elenco);
      }),
    []
  );

  return componenti;
}

/** Tutto il menù, aggiornato in tempo reale e nell'ordine in cui è stato
 * sistemato riga per riga. I piatti finiti restano nell'elenco: vanno
 * mostrati barrati, non nascosti. */
export function useProdotti(): Prodotto[] {
  const [prodotti, setProdotti] = useState<Prodotto[]>([]);

  useEffect(
    () =>
      // L'ordinamento si fa qui e non nella query: una query "orderBy" salta i
      // documenti a cui quel campo manca, e un piatto salvato prima di questa
      // versione sparirebbe dall'elenco invece di farsi sistemare.
      onSnapshot(collection(db, 'prodotti'), (snapshot) => {
        const elenco = snapshot.docs.map((doc) => doc.data() as Prodotto);
        elenco.sort((a, b) => (a.ordine ?? Infinity) - (b.ordine ?? Infinity) || a.nome.localeCompare(b.nome, 'it'));
        setProdotti(elenco);
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

/** Le comande della serata ancora da evadere: quelle da preparare e quelle
 * pronte che aspettano di essere consegnate. Le consegnate escono da sole
 * dall'elenco, così il pannello resta leggero tutta la sera.
 *
 * Il filtro per settore e l'ordinamento si fanno qui e non nella query: una
 * query che li mettesse insieme richiederebbe un indice composto su Firestore,
 * e i numeri di una serata stanno comodamente in memoria. */
export function useSottoOrdiniDaEvadere(): SottoOrdine[] {
  const [sottoOrdini, setSottoOrdini] = useState<SottoOrdine[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `serate/${SERATA_ID_OGGI}/sottoOrdini`),
      where('stato', 'in', ['in_preparazione', 'pronta'])
    );
    return onSnapshot(q, (snapshot) => {
      const elenco = snapshot.docs.map((doc) => doc.data() as SottoOrdine);
      // Prima le più vecchie: in cucina si lavora in ordine di arrivo.
      elenco.sort(
        (a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0) || a.numeroOrdine - b.numeroOrdine
      );
      setSottoOrdini(elenco);
    });
  }, []);

  return sottoOrdini;
}

/** Ordini della serata di oggi ancora "aperti": bozze dal QR mai confermate,
 * ordini confermati in attesa di pagamento e ordini pagati non ancora
 * completati. */
export function useOrdiniAperti(): Ordine[] {
  const [ordini, setOrdini] = useState<Ordine[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `serate/${SERATA_ID_OGGI}/ordini`),
      where('stato', 'in', ['bozza', 'da_pagare', 'in_evasione']),
      orderBy('numero')
    );
    return onSnapshot(q, (snapshot) => {
      setOrdini(snapshot.docs.map((doc) => doc.data() as Ordine));
    });
  }, []);

  return ordini;
}

/** Ordini della serata già consegnati del tutto. Servono ai conti di fine
 * serata: quanti ne sono stati chiusi e, insieme a quelli ancora in
 * lavorazione, quanto ha incassato ciascuna cassa. */
export function useOrdiniCompletati(): Ordine[] {
  const [ordini, setOrdini] = useState<Ordine[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, `serate/${SERATA_ID_OGGI}/ordini`),
      where('stato', '==', 'completata'),
      orderBy('numero')
    );
    return onSnapshot(q, (snapshot) => {
      setOrdini(snapshot.docs.map((doc) => doc.data() as Ordine));
    });
  }, []);

  return ordini;
}

/** L'impaginazione dei biglietti, decisa dall'amministratore. Un biglietto
 * mai modificato non ha un documento: vale quella di partenza. */
export function useBiglietti(): Record<TipoBiglietto, Biglietto> {
  const [biglietti, setBiglietti] = useState<Record<TipoBiglietto, Biglietto>>(BIGLIETTI_INIZIALI);

  useEffect(
    () =>
      onSnapshot(collection(db, 'biglietti'), (snapshot) => {
        const salvati = new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as Biglietto]));
        setBiglietti(
          Object.fromEntries(
            TIPI_BIGLIETTO.map((tipo) => [tipo, salvati.get(tipo) ?? BIGLIETTI_INIZIALI[tipo]])
          ) as Record<TipoBiglietto, Biglietto>
        );
      }),
    []
  );

  return biglietti;
}

/** Le immagini caricate (logo, stemma, sponsor), per id. */
export function useImmagini(): Map<string, Immagine> {
  const [immagini, setImmagini] = useState(new Map<string, Immagine>());

  useEffect(
    () =>
      onSnapshot(collection(db, 'immagini'), (snapshot) => {
        setImmagini(new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as Immagine])));
      }),
    []
  );

  return immagini;
}
