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
