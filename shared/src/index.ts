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

/** bozza: inviato dal QR, non ancora in cassa. da_pagare: confermato in cassa,
 * numero assegnato, resoconto stampato, porzioni già tenute da parte; aspetta
 * il pagamento. in_evasione: incassato e inviato ai reparti. */
export type StatoOrdine =
  | 'bozza'
  | 'da_pagare'
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
  /** Progressivo della serata: per la cassa è quello della sua lettera (A0007
   * ha numero 7); per un ordine dal QR è il numero mostrato al cliente. */
  numero: number;
  /** Lettera della cassa che ha preso l'ordine. Null finché un ordine dal QR
   * non passa in cassa; assente negli ordini creati prima delle casse A/B. */
  cassa?: string | null;
  /** Numero di comanda, lettera della cassa + progressivo (es. "A0001"). */
  codice?: string | null;
  /** Contenuto del codice a barre stampato: codice, data, ora e cassa, solo
   * lettere e cifre (es. "A0001202609162130A"). */
  codiceBarre?: string | null;
  stato: StatoOrdine;
  tipo: TipoOrdine;
  tavolo: number | null;
  coperti: number | null;
  items: ItemOrdine[];
  totale: number;
  createdAt: FirestoreTimestampLike;
  /** Quando la cassa lo ha confermato e stampato il resoconto. */
  confirmedAt: FirestoreTimestampLike | null;
  /** Quando la cassa ha incassato e l'ordine è partito verso i reparti. */
  pagatoAt?: FirestoreTimestampLike | null;
  /** Quando in Distribuzione è uscita la copia cucina. Serve a stamparla una
   * volta sola: chi la stampa se lo prende qui, e anche riaprendo la pagina o
   * accendendo un secondo computer non escono due fogli per lo stesso ordine. */
  copiaCucinaStampataAt?: FirestoreTimestampLike | null;
  completedAt: FirestoreTimestampLike | null;
  cancelledAt: FirestoreTimestampLike | null;
}

export interface ItemSottoOrdine {
  prodottoId: string;
  nome: string;
  quantita: number;
}

/** Quello che il settore deve materialmente mettere sul fuoco: non il piatto
 * ordinato ma le sue parti. La quantità può essere frazionaria (mezzo pollo in
 * una grigliata) e si arrotonda per eccesso solo sul totale del pannello, mai
 * comanda per comanda: due mezzi polli fanno un pollo, non due. */
export interface ComponenteSottoOrdine {
  /** Id del componente, oppure del piatto stesso quando non ha composizione. */
  id: string;
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
  /** I piatti ordinati che danno lavoro a questo settore. */
  items: ItemSottoOrdine[];
  /** Cosa preparare, componente per componente, per quei piatti. Assente
   * nelle comande create prima delle composizioni. */
  componenti?: ComponenteSottoOrdine[];
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
  /** Di cosa è fatto il piatto e quale settore prepara ciascuna parte. Vuota
   * o assente = il piatto è un pezzo unico, preparato dal suo settore. */
  composizione?: RigaComposizione[];
  /** Contrassegnato come novità nel menù dal QR. */
  novita: boolean;
  /** Serata in cui il piatto è finito, così il cliente lo vede barrato senza
   * conoscere i numeri. Riferendosi a una serata precisa si azzera da solo la
   * sera dopo. Null = disponibile. */
  esauritoSerata: string | null;
}

/** Un'unità che un settore prepara davvero: un pollo sulla griglia, una
 * salsiccia, una porzione di patatine. È il componente a dire chi lo prepara,
 * così un piatto può far lavorare più settori insieme. */
export interface Componente {
  id: string;
  nome: string;
  settore: Settore;
}

/** Quanto di un componente serve per un piatto. Può essere frazionario:
 * mezzo pollo in una grigliata mista. */
export interface RigaComposizione {
  componenteId: string;
  quantita: number;
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
  /** Progressivo degli ordini dal QR. */
  contatoreOrdini: number;
  /** Progressivo di ciascuna cassa: { A: 12, B: 9 }. Riparte ogni serata. */
  contatoriCassa?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Impaginazione dei biglietti stampati
//
// Un biglietto non è disegnato nel codice: è un elenco di blocchi, che
// l'amministratore accende, spegne e trascina dalla schermata "Biglietti".
// Qui ci sono le forme e la disposizione di partenza, che riproduce i fogli
// come erano prima che si potessero comporre.
// ---------------------------------------------------------------------------

/** I biglietti componibili. Il cartello col QR del tavolo non è qui: è un
 * manifesto, non un biglietto d'ordine. */
export type TipoBiglietto = 'resoconto' | 'copiaCucina';

export const TIPI_BIGLIETTO: TipoBiglietto[] = ['resoconto', 'copiaCucina'];

export const NOME_BIGLIETTO: Record<TipoBiglietto, string> = {
  resoconto: 'Resoconto per il cliente',
  copiaCucina: 'Copia cucina',
};

export const SPIEGAZIONE_BIGLIETTO: Record<TipoBiglietto, string> = {
  resoconto: 'Lo stampa la cassa alla conferma e lo dà al cliente, che lo porta a pagare.',
  copiaCucina: 'Esce in Distribuzione, segue il vassoio e si legge col lettore prima di portarlo al tavolo.',
};

export type TipoBlocco =
  | 'immagine'
  | 'titolo'
  | 'testo'
  | 'codice'
  | 'tavolo'
  | 'voci'
  | 'totale'
  | 'codiceBarre'
  | 'riga'
  | 'spazio';

export const TIPI_BLOCCO: TipoBlocco[] = [
  'immagine',
  'titolo',
  'testo',
  'codice',
  'tavolo',
  'voci',
  'totale',
  'codiceBarre',
  'riga',
  'spazio',
];

export const NOME_BLOCCO: Record<TipoBlocco, string> = {
  immagine: 'Immagine',
  titolo: 'Titolo',
  testo: 'Testo libero',
  codice: 'Numero di comanda',
  tavolo: 'Tavolo e coperti',
  voci: 'Elenco dei piatti',
  totale: 'Totale',
  codiceBarre: 'Codice a barre',
  riga: 'Riga di separazione',
  spazio: 'Spazio vuoto',
};

export type Allineamento = 'sinistra' | 'centro' | 'destra';
export type Grandezza = 'piccolo' | 'normale' | 'grande' | 'enorme' | 'gigante';

/** Su un foglio orizzontale conviene affiancare: i blocchi "sinistra" e
 * "destra" vicini tra loro finiscono in due colonne, quelli "intera"
 * occupano tutta la larghezza. */
export type Colonna = 'intera' | 'sinistra' | 'destra';

export interface BloccoBiglietto {
  id: string;
  tipo: TipoBlocco;
  attivo: boolean;
  colonna: Colonna;
  allineamento?: Allineamento;
  grandezza?: Grandezza;
  grassetto?: boolean;
  /** Per "titolo" e "testo". */
  testo?: string;
  /** Per "immagine": il documento della raccolta `immagini`. */
  immagineId?: string | null;
  /** Per "immagine": quanto larga stamparla, in millimetri. */
  larghezzaMm?: number;
  /** Per "voci". */
  mostraPrezzi?: boolean;
  /** Per "voci": il quadratino da spuntare componendo il vassoio. */
  caselleSpunta?: boolean;
  /** Per "tavolo". */
  mostraCoperti?: boolean;
  /** Per "codiceBarre": la riga in chiaro sotto le strisce. */
  mostraRigaLeggibile?: boolean;
  /** Per "spazio". */
  altezzaMm?: number;
}

export type FormatoCarta = 'a5-orizzontale' | 'a5-verticale' | 'a4-orizzontale' | 'a4-verticale';

export const MISURE_CARTA: Record<
  FormatoCarta,
  { nome: string; regolaCss: string; larghezzaMm: number; altezzaMm: number }
> = {
  'a5-orizzontale': { nome: 'A5 orizzontale', regolaCss: 'A5 landscape', larghezzaMm: 210, altezzaMm: 148 },
  'a5-verticale': { nome: 'A5 verticale', regolaCss: 'A5 portrait', larghezzaMm: 148, altezzaMm: 210 },
  'a4-orizzontale': { nome: 'A4 orizzontale', regolaCss: 'A4 landscape', larghezzaMm: 297, altezzaMm: 210 },
  'a4-verticale': { nome: 'A4 verticale', regolaCss: 'A4 portrait', larghezzaMm: 210, altezzaMm: 297 },
};

export const FORMATI_CARTA = Object.keys(MISURE_CARTA) as FormatoCarta[];

export interface Biglietto {
  id: TipoBiglietto;
  formato: FormatoCarta;
  /** Margine bianco intorno al foglio, in millimetri. */
  margineMm: number;
  blocchi: BloccoBiglietto[];
}

/** Blocchi che non si possono spegnere, perché senza di loro il sistema non
 * funziona più: senza numero e codice a barre la copia cucina non chiude
 * l'ordine, e un resoconto senza totale non si può far pagare. */
export const BLOCCHI_OBBLIGATORI: Record<TipoBiglietto, TipoBlocco[]> = {
  resoconto: ['totale'],
  copiaCucina: ['codice', 'codiceBarre'],
};

/** La disposizione di partenza, e quella a cui si torna col tasto
 * "Ripristina": gli stessi fogli di prima, su A5 orizzontale. */
export const BIGLIETTI_INIZIALI: Record<TipoBiglietto, Biglietto> = {
  resoconto: {
    id: 'resoconto',
    formato: 'a5-orizzontale',
    margineMm: 10,
    blocchi: [
      { id: 'testata', tipo: 'titolo', attivo: true, colonna: 'intera', testo: 'Sagra di Mazzocco', grandezza: 'grande', allineamento: 'sinistra', grassetto: true },
      { id: 'sottotitolo', tipo: 'testo', attivo: true, colonna: 'intera', testo: 'Resoconto ordine', grandezza: 'piccolo', allineamento: 'sinistra' },
      { id: 'riga-testata', tipo: 'riga', attivo: true, colonna: 'intera' },
      { id: 'voci', tipo: 'voci', attivo: true, colonna: 'sinistra', mostraPrezzi: true, caselleSpunta: false },
      { id: 'totale', tipo: 'totale', attivo: true, colonna: 'sinistra', grandezza: 'grande', allineamento: 'destra' },
      { id: 'codice', tipo: 'codice', attivo: true, colonna: 'destra', grandezza: 'gigante', allineamento: 'centro', grassetto: true },
      { id: 'tavolo', tipo: 'tavolo', attivo: true, colonna: 'destra', allineamento: 'centro', mostraCoperti: true },
      { id: 'codice-barre', tipo: 'codiceBarre', attivo: true, colonna: 'destra', allineamento: 'centro', mostraRigaLeggibile: true },
      { id: 'saluto', tipo: 'testo', attivo: false, colonna: 'intera', testo: 'Grazie e buon appetito!', grandezza: 'normale', allineamento: 'centro' },
      { id: 'logo', tipo: 'immagine', attivo: false, colonna: 'intera', immagineId: null, larghezzaMm: 40, allineamento: 'centro' },
    ],
  },
  copiaCucina: {
    id: 'copiaCucina',
    formato: 'a5-orizzontale',
    margineMm: 10,
    blocchi: [
      { id: 'testata', tipo: 'titolo', attivo: true, colonna: 'intera', testo: 'Copia cucina', grandezza: 'normale', allineamento: 'sinistra', grassetto: true },
      { id: 'riga-testata', tipo: 'riga', attivo: true, colonna: 'intera' },
      { id: 'voci', tipo: 'voci', attivo: true, colonna: 'sinistra', mostraPrezzi: false, caselleSpunta: true },
      { id: 'codice', tipo: 'codice', attivo: true, colonna: 'destra', grandezza: 'gigante', allineamento: 'centro', grassetto: true },
      { id: 'tavolo', tipo: 'tavolo', attivo: true, colonna: 'destra', allineamento: 'centro', grandezza: 'grande', mostraCoperti: true },
      { id: 'codice-barre', tipo: 'codiceBarre', attivo: true, colonna: 'destra', allineamento: 'centro', mostraRigaLeggibile: true },
      { id: 'logo', tipo: 'immagine', attivo: false, colonna: 'intera', immagineId: null, larghezzaMm: 30, allineamento: 'centro' },
    ],
  },
};

/** Un'immagine caricata dall'amministratore (logo, stemma, sponsor). Sta in
 * Firestore, non in un archivio a parte: sono pochi disegni piccoli, così
 * arrivano con gli altri dati e restano disponibili anche senza rete. */
export interface Immagine {
  id: string;
  nome: string;
  /** L'immagine stessa, già rimpicciolita, come "data:image/png;base64,…". */
  dati: string;
  larghezza: number;
  altezza: number;
  /** Peso in byte del campo `dati`: serve a non superare il limite del
   * documento (1 MB) e a tenere le stampe leggere. */
  byte: number;
  createdAt: FirestoreTimestampLike;
}

/** Limite di sicurezza per un'immagine: un documento Firestore non può
 * superare 1 MB, e un logo pesante rallenterebbe la stampa. */
export const BYTE_MASSIMI_IMMAGINE = 400 * 1024;

/** Il contrario di componiCodiceBarre: dal testo letto dal lettore ricava le
 * parti. Si legge dal fondo, perché le parti finali hanno lunghezza fissa.
 * Null se il testo non ha la forma giusta. */
export function leggiCodiceBarre(
  testo: string
): { codice: string; data: string; ora: string; cassa: string } | null {
  const trovato = /^([A-Z]\d{4,})(\d{8})(\d{4})([A-Z])$/.exec(testo.trim().toUpperCase());
  if (!trovato || trovato[1][0] !== trovato[4]) return null;
  return { codice: trovato[1], data: trovato[2], ora: trovato[3], cassa: trovato[4] };
}

/** La lettera che identifica una cassa: una sola lettera maiuscola. */
export const REGOLA_LETTERA_CASSA = /^[A-Z]$/;

export const LETTERE_CASSA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** "A" + 1 -> "A0001". */
export function formattaCodiceOrdine(lettera: string, numero: number): string {
  return `${lettera}${numero.toString().padStart(4, '0')}`;
}

/** Il testo dentro il codice a barre: numero di comanda, data (AAAAMMGG), ora
 * (HHMM) e cassa, attaccati a posizioni fisse. Solo lettere e cifre: trattini,
 * virgole e due punti possono uscire sbagliati se il lettore è impostato su
 * una tastiera diversa da quella del computer. */
export function componiCodiceBarre(codice: string, dataOra: { data: string; ora: string }, lettera: string): string {
  return `${codice}${dataOra.data}${dataOra.ora}${lettera}`;
}

// ---------------------------------------------------------------------------
// Utenti e ruoli
// ---------------------------------------------------------------------------

/** Un account vale per tutte le app. L'amministratore generale può tutto
 * ovunque; gli altri hanno al massimo un ruolo per ciascuna app, e nessun
 * accesso alle app per cui non ne hanno uno. */

/** "cucina", "griglia" e "bar" coincidono apposta con i settori: chi ha quel
 * ruolo gestisce quel settore. "distribuzione" è la postazione dove esce la
 * copia cucina, si compongono i vassoi e si legge il codice a barre. */
export type RuoloComande = 'cassa' | 'cucina' | 'griglia' | 'bar' | 'distribuzione';

export const RUOLI_COMANDE: RuoloComande[] = ['cassa', 'cucina', 'griglia', 'bar', 'distribuzione'];

export const NOME_RUOLO_COMANDE: Record<RuoloComande, string> = {
  cassa: 'Cassa',
  cucina: 'Cucina',
  griglia: 'Griglia',
  bar: 'Bar',
  distribuzione: 'Distribuzione',
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
  /** Lettera della cassa di questa persona (A, B…): tutti i suoi ordini prendono
   * quella lettera, a qualunque computer si sieda. Null = nessuna. */
  letteraCassa?: string | null;
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

/** Prefisso del codice sotto-ordine per settore (es. "G" + "A0001" -> "GA0001"). */
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
  letteraCassa?: string | null;
}

export interface ImpostaLetteraCassaRichiesta {
  uid: string;
  /** Null per toglierla. */
  letteraCassa: string | null;
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
  /** Numero di comanda (es. "A0001"): assente per le bozze dal QR. */
  codice?: string;
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
  /** Obbligatori: finiscono sulla copia cucina, l'inserviente deve sapere dove
   * portare il vassoio. */
  tavolo: number;
  coperti: number;
}

export interface ConfermaOrdineRichiesta {
  serataId: string;
  numero: number;
}

export interface InviaOrdineRichiesta {
  serataId: string;
  ordineId: string;
}

export interface InviaOrdineRisposta {
  ordineId: string;
  codice: string;
}

export interface SegnaCopiaCucinaStampataRichiesta {
  serataId: string;
  ordineId: string;
}

export interface SegnaCopiaCucinaStampataRisposta {
  ordineId: string;
  /** Vero solo per chi si è preso la stampa: gli altri non stampano. */
  daStampare: boolean;
}

export interface ChiudiOrdineRichiesta {
  serataId: string;
  /** Il testo letto dal lettore di codici a barre. */
  codiceBarre: string;
}

export interface ChiudiOrdineRisposta {
  ordineId: string;
  codice: string;
  tavolo: number | null;
  coperti: number | null;
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

/** Quanto è durata l'emissione di un ordine, in millisecondi: dal momento in
 * cui la cassa lo manda ai reparti ("Invia ordine", dopo il pagamento) a
 * quando in Distribuzione ne viene letto il codice a barre. Null se l'ordine
 * non è ancora arrivato in fondo, oppure se è stato creato prima che l'orario
 * di pagamento venisse registrato: meglio non contarlo che sballare la media. */
export function tempoEmissione(ordine: Ordine): number | null {
  if (!ordine.pagatoAt || !ordine.completedAt) return null;
  const durata = millisecondiTimestamp(ordine.completedAt) - millisecondiTimestamp(ordine.pagatoAt);
  return durata >= 0 ? durata : null;
}

/** Un orario di Firestore in millisecondi, senza dipendere dal SDK: il campo
 * arriva come secondi + nanosecondi sia dal client che dal server. */
export function millisecondiTimestamp(orario: FirestoreTimestampLike): number {
  return orario.seconds * 1000 + orario.nanoseconds / 1e6;
}
