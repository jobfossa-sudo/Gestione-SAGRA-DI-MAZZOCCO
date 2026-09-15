// Tipi condivisi tra le app (Comande, Magazzino, Contabilità) e le Cloud Functions.

/** Struttura minima compatibile sia con il Timestamp del client SDK che
 * con quello dell'Admin SDK di Firestore, senza dipendere da nessuno dei due. */
export interface FirestoreTimestampLike {
  seconds: number;
  nanoseconds: number;
}

export type Reparto = 'cucina' | 'bevande';

export type StatoOrdine =
  | 'bozza'
  | 'confermata_pagata'
  | 'in_evasione'
  | 'completata'
  | 'annullata';

export type StatoSottoOrdine = 'in_preparazione' | 'pronta' | 'consegnata';

export type TipoOrdine = 'cassa' | 'qr';

export interface ItemOrdine {
  prodottoId: string;
  nome: string;
  reparto: Reparto;
  prezzo: number;
  quantita: number;
}

export interface Ordine {
  id: string;
  serataId: string;
  numero: number;
  stato: StatoOrdine;
  tipo: TipoOrdine;
  tavolo: number | null;
  coperti: number | null;
  items: ItemOrdine[];
  totale: number;
  createdAt: FirestoreTimestampLike;
  confirmedAt: FirestoreTimestampLike | null;
  completedAt: FirestoreTimestampLike | null;
  cancelledAt: FirestoreTimestampLike | null;
}

export interface ItemSottoOrdine {
  prodottoId: string;
  nome: string;
  quantita: number;
}

export interface SottoOrdine {
  id: string;
  codice: string;
  ordineId: string;
  serataId: string;
  numeroOrdine: number;
  reparto: Reparto;
  stato: StatoSottoOrdine;
  items: ItemSottoOrdine[];
  createdAt: FirestoreTimestampLike;
  readyAt: FirestoreTimestampLike | null;
  deliveredAt: FirestoreTimestampLike | null;
}

export interface Prodotto {
  id: string;
  nome: string;
  prezzo: number;
  reparto: Reparto;
  disponibile: boolean;
  categoria?: string;
}

export interface Serata {
  id: string;
  data: string;
  aperta: boolean;
  contatoreOrdini: number;
}

/** Prefisso del codice sotto-ordine per reparto (es. "C" + 025 -> "C025"). */
export const PREFISSO_REPARTO: Record<Reparto, string> = {
  cucina: 'C',
  bevande: 'B',
};

// ---------------------------------------------------------------------------
// Richieste/risposte delle Cloud Functions callable — condivise tra
// `functions/` (che le implementa) e le app client (che le chiamano), così
// i due lati non possono andare fuori sincrono sulla forma dei dati.
// ---------------------------------------------------------------------------

export interface ItemOrdineRichiesta {
  prodottoId: string;
  quantita: number;
}

export interface CreaOrdineRisposta {
  ordineId: string;
  numero: number;
  totale: number;
}

export interface CreaOrdineBozzaRichiesta {
  serataId: string;
  tavolo: number;
  coperti: number;
  items: ItemOrdineRichiesta[];
}

export interface CreaOrdineCassaRichiesta {
  serataId: string;
  items: ItemOrdineRichiesta[];
  tavolo?: number | null;
  coperti?: number | null;
}

export interface ConfermaOrdineRichiesta {
  serataId: string;
  numero: number;
}

export interface SegnaSottoOrdineProntoRichiesta {
  serataId: string;
  sottoOrdineId: string;
}

export interface SegnaSottoOrdineProntoRisposta {
  sottoOrdineId: string;
}

export interface ConsegnaSottoOrdineRichiesta {
  serataId: string;
  codice: string;
}

export interface ConsegnaSottoOrdineRisposta {
  ordineId: string;
  ordineCompletato: boolean;
}

export interface AnnullaOrdineRichiesta {
  serataId: string;
  ordineId: string;
}

export interface AnnullaOrdineRisposta {
  ordineId: string;
}
