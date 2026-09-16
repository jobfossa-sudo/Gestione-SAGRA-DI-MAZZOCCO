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

// ---------------------------------------------------------------------------
// Utenti e ruoli
// ---------------------------------------------------------------------------

/** Un account vale per tutte le app. L'amministratore generale può tutto
 * ovunque; gli altri hanno al massimo un ruolo per ciascuna app, e nessun
 * accesso alle app per cui non ne hanno uno. */

/** "cucina" e "bevande" coincidono apposta con i reparti: chi ha quel ruolo
 * gestisce quel reparto. */
export type RuoloComande = 'cassa' | 'cucina' | 'bevande' | 'consegna';

export const RUOLI_COMANDE: RuoloComande[] = ['cassa', 'cucina', 'bevande', 'consegna'];

export const NOME_RUOLO_COMANDE: Record<RuoloComande, string> = {
  cassa: 'Cassa',
  cucina: 'Cucina',
  bevande: 'Bevande',
  consegna: 'Consegna',
};

/** Una chiave per app. Magazzino e Contabilità si aggiungeranno qui con i
 * rispettivi ruoli quando verranno costruite. */
export interface Accessi {
  comande?: RuoloComande;
}

/** Forma delle "custom claims" dell'account: impostabili solo dal server,
 * lette da Cloud Functions e regole di Firestore per decidere i permessi. */
export interface Permessi extends Accessi {
  amministratore?: boolean;
}

export interface Utente {
  uid: string;
  nomeUtente: string;
  nome: string;
  amministratore: boolean;
  accessi: Accessi;
  attivo: boolean;
  createdAt: FirestoreTimestampLike;
}

export const REGOLA_NOME_UTENTE = /^[a-z0-9._-]{3,30}$/;

/** Firebase Authentication accetta solo email: ogni nome utente diventa
 * un'email tecnica su un dominio riservato (.invalid non esiste e non può
 * ricevere posta), così i volontari non devono fornire la propria. */
export function emailDaNomeUtente(nomeUtente: string): string {
  return `${nomeUtente.trim().toLowerCase()}@utenti.sagra-mazzocco.invalid`;
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

export interface CreaUtenteRichiesta {
  nomeUtente: string;
  nome: string;
  password: string;
  amministratore: boolean;
  accessi: Accessi;
}

export interface AggiornaPermessiRichiesta {
  uid: string;
  amministratore: boolean;
  accessi: Accessi;
}

export interface ReimpostaPasswordRichiesta {
  uid: string;
  password: string;
}

export interface ImpostaAttivoRichiesta {
  uid: string;
  attivo: boolean;
}

/** Risposta comune delle operazioni sugli utenti. */
export interface UtenteRisposta {
  uid: string;
}

export interface InizializzaSistemaRichiesta {
  /** Codice segreto configurato sul server: impedisce che uno sconosciuto
   * si crei da solo il primo account amministratore. */
  codice: string;
  nomeUtente: string;
  nome: string;
  password: string;
}

export interface InizializzaSistemaRisposta {
  uid: string;
}

export interface ApriSerataRichiesta {
  /** Data della serata in formato AAAA-MM-GG, usata anche come id. */
  data: string;
}

export interface ApriSerataRisposta {
  serataId: string;
  giaEsistente: boolean;
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
