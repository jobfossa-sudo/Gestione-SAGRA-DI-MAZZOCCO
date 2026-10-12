import { onAuthStateChanged, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  confrontaPersone,
  edizioneDiSerata,
  type ChiusuraCassa,
  type Edizione,
  type EntrataExtra,
  type Giornata,
  type OrdineBanco,
  type Ordine,
  type Permessi,
  type Presenza,
  type Serata,
  type Uscita,
  type Utente,
} from '@sagra-mazzocco/shared';
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

/** Tutte le serate, dalla più recente. Le crea Comande quando si apre una
 * serata: qui si leggono e basta. */
export function useSerate(): Serata[] | null {
  // Null finché il server non ha risposto: "nessuna serata" e "non ancora
  // arrivate" sono due cose diverse, e online la differenza si vede.
  const [serate, setSerate] = useState<Serata[] | null>(null);

  useEffect(
    () =>
      onSnapshot(query(collection(db, 'serate'), orderBy('data', 'desc')), (snapshot) =>
        setSerate(snapshot.docs.map((doc) => doc.data() as Serata))
      ),
    []
  );

  return serate;
}

/** Gli ordini dei tavoli di una serata. Tutti, annullati compresi: a decidere
 * cosa fa incasso e cosa no è il conto, non la lettura. */
export function useOrdini(serataId: string | null): Ordine[] {
  const [ordini, setOrdini] = useState<Ordine[]>([]);

  useEffect(() => {
    setOrdini([]);
    if (!serataId) return;
    return onSnapshot(collection(db, `serate/${serataId}/ordini`), (snapshot) =>
      setOrdini(snapshot.docs.map((doc) => doc.data() as Ordine))
    );
  }, [serataId]);

  return ordini;
}

/** Gli scontrini dei banchi (BAR, BEVANDE) di una serata. */
export function useOrdiniBanco(serataId: string | null): OrdineBanco[] {
  const [ordini, setOrdini] = useState<OrdineBanco[]>([]);

  useEffect(() => {
    setOrdini([]);
    if (!serataId) return;
    return onSnapshot(collection(db, `serate/${serataId}/ordiniBanco`), (snapshot) =>
      setOrdini(snapshot.docs.map((doc) => doc.data() as OrdineBanco))
    );
  }, [serataId]);

  return ordini;
}

/** I conteggi di fine serata, per punto cassa.
 *
 * Restituisce anche se la prima risposta è arrivata: le caselle dei conteggi
 * si riempiono una volta sola, quando nascono, e disegnarle prima che
 * l'archivio abbia risposto vorrebbe dire mostrare degli zeri al posto dei
 * numeri salvati ieri sera. */
export function useChiusure(serataId: string | null): {
  chiusure: Map<string, ChiusuraCassa>;
  caricate: boolean;
} {
  const [stato, setStato] = useState({ chiusure: new Map<string, ChiusuraCassa>(), caricate: false });

  useEffect(() => {
    setStato({ chiusure: new Map(), caricate: false });
    if (!serataId) return;
    return onSnapshot(collection(db, `serate/${serataId}/chiusure`), (snapshot) =>
      setStato({
        chiusure: new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as ChiusuraCassa])),
        caricate: true,
      })
    );
  }, [serataId]);

  return stato;
}

/** Chi c'era in una giornata, per uid. La giornata di una serata di sagra ha
 * lo stesso id della serata, quindi qui si passa anche un serataId. */
export function usePresenze(data: string | null): Map<string, Presenza> {
  const [presenze, setPresenze] = useState(new Map<string, Presenza>());

  useEffect(() => {
    setPresenze(new Map());
    if (!data) return;
    return onSnapshot(collection(db, `edizioni/${edizioneDiSerata(data)}/giornate/${data}/presenze`), (snapshot) =>
      setPresenze(new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as Presenza])))
    );
  }, [data]);

  return presenze;
}

/** Una giornata, se è già stata creata. */
export function useGiornata(data: string | null): { giornata: Giornata | null; caricata: boolean } {
  const [stato, setStato] = useState<{ giornata: Giornata | null; caricata: boolean }>({ giornata: null, caricata: false });

  useEffect(() => {
    setStato({ giornata: null, caricata: false });
    if (!data) return;
    return onSnapshot(doc(db, `edizioni/${edizioneDiSerata(data)}/giornate`, data), (snapshot) =>
      setStato({ giornata: snapshot.exists() ? (snapshot.data() as Giornata) : null, caricata: true })
    );
  }, [data]);

  return stato;
}

/** Tutte le persone della sagra, con o senza accesso alle app, per cognome:
 * sono le righe della griglia delle presenze. Si ordina qui e non nella
 * richiesta, perché i profili di prima non hanno il cognome e Firestore li
 * lascerebbe fuori. */
export function useUtenti(): Utente[] {
  const [utenti, setUtenti] = useState<Utente[]>([]);

  useEffect(
    () =>
      onSnapshot(collection(db, 'utenti'), (snapshot) =>
        setUtenti(snapshot.docs.map((doc) => doc.data() as Utente).sort(confrontaPersone))
      ),
    []
  );

  return utenti;
}

export function useEdizione(edizioneId: string): Edizione | null {
  const [edizione, setEdizione] = useState<Edizione | null>(null);

  useEffect(
    () =>
      onSnapshot(doc(db, 'edizioni', edizioneId), (snapshot) =>
        setEdizione(snapshot.exists() ? (snapshot.data() as Edizione) : null)
      ),
    [edizioneId]
  );

  return edizione;
}

export function useUscite(edizioneId: string): Uscita[] {
  const [uscite, setUscite] = useState<Uscita[]>([]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, `edizioni/${edizioneId}/uscite`), orderBy('data', 'desc')), (snapshot) =>
        setUscite(snapshot.docs.map((doc) => doc.data() as Uscita))
      ),
    [edizioneId]
  );

  return uscite;
}

export function useEntrate(edizioneId: string): EntrataExtra[] {
  const [entrate, setEntrate] = useState<EntrataExtra[]>([]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, `edizioni/${edizioneId}/entrate`), orderBy('data', 'desc')), (snapshot) =>
        setEntrate(snapshot.docs.map((doc) => doc.data() as EntrataExtra))
      ),
    [edizioneId]
  );

  return entrate;
}

/** I totali di tutte le serate insieme, per il report dell'edizione.
 *
 * Un ascolto per serata: sono una manciata (una sagra dura cinque sere), e
 * così ogni numero resta vivo mentre la sagra è in corso. Leggere tutto in un
 * colpo solo vorrebbe dire una query su più collezioni, che Firestore non fa. */
export function useTotaliSerate(serataIds: string[]): Map<string, { ordini: Ordine[]; banco: OrdineBanco[] }> {
  const [totali, setTotali] = useState(new Map<string, { ordini: Ordine[]; banco: OrdineBanco[] }>());
  // L'elenco arriva come array nuovo a ogni disegno: si confronta il contenuto,
  // altrimenti gli ascolti si spegnerebbero e riaccenderebbero di continuo.
  const chiave = serataIds.join(',');

  useEffect(() => {
    const ids = chiave ? chiave.split(',') : [];
    const dati = new Map<string, { ordini: Ordine[]; banco: OrdineBanco[] }>();
    const aggiorna = (id: string, parte: Partial<{ ordini: Ordine[]; banco: OrdineBanco[] }>) => {
      dati.set(id, { ordini: [], banco: [], ...dati.get(id), ...parte });
      setTotali(new Map(dati));
    };

    const spegni = ids.flatMap((id) => [
      onSnapshot(collection(db, `serate/${id}/ordini`), (s) =>
        aggiorna(id, { ordini: s.docs.map((d) => d.data() as Ordine) })
      ),
      onSnapshot(collection(db, `serate/${id}/ordiniBanco`), (s) =>
        aggiorna(id, { banco: s.docs.map((d) => d.data() as OrdineBanco) })
      ),
    ]);

    return () => spegni.forEach((f) => f());
  }, [chiave]);

  return totali;
}

/** Le giornate dell'edizione, in ordine di data. */
export function useGiornate(edizioneId: string): Giornata[] {
  const [giornate, setGiornate] = useState<Giornata[]>([]);

  useEffect(
    () =>
      onSnapshot(query(collection(db, `edizioni/${edizioneId}/giornate`), orderBy('data')), (snapshot) =>
        setGiornate(snapshot.docs.map((doc) => doc.data() as Giornata))
      ),
    [edizioneId]
  );

  return giornate;
}

/** Le presenze di più giornate, per giornata: servono tutte insieme per i
 * riepiloghi e le stampe. */
export function usePresenzeGiornate(edizioneId: string, giornataIds: string[]): Map<string, Presenza[]> {
  const [presenze, setPresenze] = useState(new Map<string, Presenza[]>());
  // L'elenco arriva come array nuovo a ogni disegno: si confronta il contenuto.
  const chiave = giornataIds.join(',');

  useEffect(() => {
    const ids = chiave ? chiave.split(',') : [];
    const dati = new Map<string, Presenza[]>();
    setPresenze(new Map());
    const spegni = ids.map((id) =>
      onSnapshot(collection(db, `edizioni/${edizioneId}/giornate/${id}/presenze`), (s) => {
        dati.set(id, s.docs.map((d) => d.data() as Presenza));
        setPresenze(new Map(dati));
      })
    );
    return () => spegni.forEach((f) => f());
  }, [edizioneId, chiave]);

  return presenze;
}
