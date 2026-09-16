// Tipi condivisi tra le app (Comande, Magazzino, Contabilità) e le Cloud Functions.

/** Struttura minima compatibile sia con il Timestamp del client SDK che
 * con quello dell'Admin SDK di Firestore, senza dipendere da nessuno dei due. */
export interface FirestoreTimestampLike {
  seconds: number;
  nanoseconds: number;
}

/** Dove si prepara il piatto: decide a quale pannello e a quale stampante va
 * il sotto-ordine. Non si mostra al cliente. */
export type Settore = 'cucina' | 'griglia' | 'bar';

export const SETTORI: Settore[] = ['cucina', 'griglia', 'bar'];

export const NOME_SETTORE: Record<Settore, string> = {
  cucina: 'Cucina',
  griglia: 'Griglia',
  bar: 'Bar',
};

/** Le portate del menù, decise dall'amministratore: se ne possono creare di
 * nuove, rinominarle e cambiarne l'ordine. */
export interface Categoria {
  id: string;
  nome: string;
  /** Posizione nel menù: il numero più basso compare per primo. */
  ordine: number;
}

/** Le portate con cui parte un impianto nuovo. Da qui in poi le gestisce
 * l'amministratore dall'app. */
export const CATEGORIE_INIZIALI: Categoria[] = [
  { id: 'primi', nome: 'Primi', ordine: 0 },
  { id: 'secondi', nome: 'Secondi', ordine: 10 },
  { id: 'contorni', nome: 'Contorni', ordine: 20 },
  { id: 'bevande', nome: 'Bevande', ordine: 30 },
  { id: 'dessert', nome: 'Dessert', ordine: 40 },
];

/** Le posizioni si numerano di dieci in dieci: così spostare una riga in mezzo
 * a due altre non obbliga a rinumerare tutto. */
export const PASSO_ORDINE = 10;

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
  settore: Settore;
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
  settore: Settore;
  stato: StatoSottoOrdine;
  items: ItemSottoOrdine[];
  createdAt: FirestoreTimestampLike;
  readyAt: FirestoreTimestampLike | null;
  deliveredAt: FirestoreTimestampLike | null;
}

export interface Prodotto {
  id: string;
  /** Portata sotto cui compare nel menù: la vede anche il cliente. */
  categoriaId: string;
  /** Chi lo prepara: serve solo all'interno, non compare nel menù dal QR. */
  settore: Settore;
  nome: string;
  /** Ingredienti o accompagnamenti, mostrati sotto il nome nel menù. */
  note: string;
  prezzo: number;
  /** Posizione dentro la propria categoria, decisa trascinando le righe. */
  ordine: number;
  /** Contrassegnato come novità nel menù dal QR. */
  novita: boolean;
  /** Serata in cui il piatto è finito, così il cliente lo vede barrato senza
   * conoscere i numeri. Riferendosi a una serata precisa si azzera da solo la
   * sera dopo. Null = disponibile. */
  esauritoSerata: string | null;
}

/** Porzioni di un piatto per una singola serata. Sta sotto la serata e non
 * sotto il prodotto perché ogni sera si riparte da capo. Visibile solo al
 * personale: il cliente non deve sapere quante ne restano. */
export interface DisponibilitaProdotto {
  prodottoId: string;
  /** Null = nessun limite (es. acqua). */
  porzioniMassime: number | null;
  venduti: number;
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

/** "cucina", "griglia" e "bar" coincidono apposta con i settori: chi ha quel
 * ruolo gestisce quel settore. */
export type RuoloComande = 'cassa' | 'cucina' | 'griglia' | 'bar' | 'consegna';

export const RUOLI_COMANDE: RuoloComande[] = ['cassa', 'cucina', 'griglia', 'bar', 'consegna'];

export const NOME_RUOLO_COMANDE: Record<RuoloComande, string> = {
  cassa: 'Cassa',
  cucina: 'Cucina',
  griglia: 'Griglia',
  bar: 'Bar',
  consegna: 'Consegna',
};

/** Una chiave per app, con i ruoli che la persona ricopre in quell'app: alla
 * sagra i volontari si danno il cambio tra postazioni, quindi possono averne
 * più di uno. Chiave assente o elenco vuoto = nessun accesso a quell'app.
 * Magazzino e Contabilità si aggiungeranno qui quando verranno costruite. */
export interface Accessi {
  comande?: RuoloComande[];
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

/** Prefisso del codice sotto-ordine per settore (es. "C" + 025 -> "C025"). */
export const PREFISSO_SETTORE: Record<Settore, string> = {
  cucina: 'C',
  griglia: 'G',
  bar: 'B',
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

export interface EliminaUtenteRichiesta {
  uid: string;
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

export interface ImpostaPorzioniRichiesta {
  serataId: string;
  prodottoId: string;
  /** Null per togliere il limite. */
  porzioniMassime: number | null;
}

export interface SegnaEsauritoRichiesta {
  serataId: string;
  prodottoId: string;
  esaurito: boolean;
}

export interface ProdottoRisposta {
  prodottoId: string;
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
