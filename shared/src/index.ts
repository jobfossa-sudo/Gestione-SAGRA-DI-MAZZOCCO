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

/** bozza: inviato dal QR, non ancora passato in cassa. in_evasione: incassato
 * e in mano ai reparti. completata: consegnato.
 *
 * da_pagare non lo produce più nessuno: era lo stato di un ordine confermato
 * e stampato che aspettava il pagamento. La cassa ora conferma a pagamento
 * avvenuto, e l'ordine nasce già in evasione. Lo stato resta qui perché gli
 * ordini di prima ce l'hanno scritto e vanno ancora mostrati e annullati. */
export type StatoOrdine =
  | 'bozza'
  | 'da_pagare'
  | 'confermata_pagata'
  | 'in_evasione'
  | 'completata'
  | 'annullata';

export type StatoSottoOrdine = 'in_preparazione' | 'pronta' | 'consegnata';

export type TipoOrdine = 'cassa' | 'qr';

/** Come ha pagato il cliente. Serve alla quadratura di fine serata: l'app sa
 * quanto ha incassato, ma senza questo non sa quanto deve esserci nel
 * cassetto e quanto sul POS. Gli ordini battuti prima che esistesse non ce
 * l'hanno: contano come contanti, che era l'unico modo di pagare. */
export type MetodoPagamento = 'contanti' | 'elettronico';

export const METODI_PAGAMENTO: MetodoPagamento[] = ['contanti', 'elettronico'];

export const NOME_PAGAMENTO: Record<MetodoPagamento, string> = {
  contanti: 'Contanti',
  elettronico: 'POS',
};

/** Il metodo di un ordine, con la regola per quelli vecchi scritta una volta
 * sola: senza campo vuol dire contanti. */
export function pagamentoDi(ordine: { pagamento?: MetodoPagamento | null }): MetodoPagamento {
  return ordine.pagamento === 'elettronico' ? 'elettronico' : 'contanti';
}

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
  /** Contanti o POS. Assente negli ordini battuti prima che si distinguesse:
   * vedi pagamentoDi(). */
  pagamento?: MetodoPagamento | null;
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
  /** Quando la comanda è stata stampata al banco che la riceve (oggi solo
   * BEVANDE). Come per la copia cucina, serve a stamparla una volta sola:
   * se lo prende chi la stampa, e due schermi accesi non fanno due fogli. */
  stampataAt?: FirestoreTimestampLike | null;
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
  /** Progressivo di ciascun banco: { bar: 12, bevande: 40 }. Anche questo
   * riparte ogni serata, come tutto il resto della numerazione. */
  contatoriBanco?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// I banchi
//
// Un banco vende e incassa per conto suo: ha il suo menù, gestito da chi ci
// lavora e non dall'amministratore, i suoi ordini e il suo incasso. Non manda
// niente ai reparti — quello che vende lo prepara e lo consegna sul posto.
//
// Di banchi ce ne sono due e sono gemelli. Quello che li distingue è una cosa
// sola: BEVANDE riceve anche le comande del bere che partono dalla cassa dei
// tavoli, BAR no. Tutto il resto — menù, cassa, archivio, incasso — è lo
// stesso codice con dentro un id diverso: due schermate identiche scritte due
// volte si sarebbero scordate l'una dell'altra alla prima modifica.
// ---------------------------------------------------------------------------

export type Banco = 'bar' | 'bevande';

export const BANCHI: Banco[] = ['bar', 'bevande'];

export const NOME_BANCO: Record<Banco, string> = {
  bar: 'BAR',
  bevande: 'BEVANDE',
};

/** Prefisso del numero d'ordine del banco: "BAR0001", "BEV0001". Non può
 * scontrarsi con i codici della cassa dei tavoli, che sono una lettera sola
 * più quattro cifre (A0001). */
export const PREFISSO_BANCO: Record<Banco, string> = {
  bar: 'BAR',
  bevande: 'BEV',
};

/** Il banco che riceve anche le comande del bere dalla cassa dei tavoli.
 * Quando il cibo dello stesso ordine arriva in Distribuzione, qui arriva la
 * parte da bere. */
export const BANCO_CON_COMANDE: Banco = 'bevande';

/** Il settore le cui comande arrivano al banco BEVANDE. È "bar": gli ordini
 * dei tavoli si dividono già per settore, e la parte da bere è la sua. Il
 * pannello "Bar" dentro Pannelli mostra le stesse comande in forma di
 * conteggio: resta lì finché non si decide di toglierlo. */
export const SETTORE_DEL_BANCO: Settore = 'bar';

/** Gruppo del menù di un banco (Birre, Caffetteria...). Sta in
 * `banchi/{banco}/categorie`: è roba del banco, non del menù della sagra. */
export interface CategoriaBanco {
  id: string;
  nome: string;
  /** Posizione nel menù: il numero più basso compare per primo. */
  ordine: number;
}

/** Una voce in vendita a un banco. Più semplice di un piatto della sagra: non
 * ha settore che la prepara né composizione, perché a prepararla è il banco
 * stesso, e non ha porzioni contate — a un banco si guarda nel frigo. */
export interface ProdottoBanco {
  id: string;
  categoriaId: string;
  nome: string;
  /** Descrizione breve, mostrata sotto il nome. */
  note: string;
  prezzo: number;
  /** Posizione dentro il proprio gruppo, decisa trascinando le righe. */
  ordine: number;
  /** Serata in cui la voce è finita, così si azzera da sola la sera dopo.
   * Null = disponibile. */
  esauritoSerata: string | null;
}

export interface ItemOrdineBanco {
  prodottoId: string;
  nome: string;
  prezzo: number;
  quantita: number;
}

export type StatoOrdineBanco = 'incassato' | 'annullato';

/** Un ordine battuto a un banco. Vive in `serate/{serata}/ordiniBanco`, non
 * insieme agli ordini dei tavoli: non ha tavolo, non ha coperti, non genera
 * comande per i reparti e non passa dalla Distribuzione. Nasce già incassato —
 * al banco si paga e si porta via — e l'unica cosa che gli può succedere dopo
 * è l'annullamento di chi ha sbagliato a battere. */
export interface OrdineBanco {
  id: string;
  serataId: string;
  banco: Banco;
  /** Progressivo della serata per quel banco: BAR0007 ha numero 7. */
  numero: number;
  /** Numero scritto sullo scontrino, es. "BAR0007". */
  codice: string;
  stato: StatoOrdineBanco;
  pagamento?: MetodoPagamento | null;
  items: ItemOrdineBanco[];
  totale: number;
  /** Chi ha battuto l'ordine: serve a sapere chi cercare se il conto non torna. */
  operatoreUid: string;
  operatoreNome: string;
  createdAt: FirestoreTimestampLike;
  cancelledAt: FirestoreTimestampLike | null;
  /** Chi ha annullato, e perché il conto della serata è cambiato. */
  annullatoDaNome?: string | null;
}

/** Il codice scritto sullo scontrino del banco: "BAR0007". */
export function formattaCodiceBanco(banco: Banco, numero: number): string {
  return `${PREFISSO_BANCO[banco]}${String(numero).padStart(4, '0')}`;
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
export type TipoBiglietto = 'resoconto' | 'copiaCucina' | 'scontrinoBanco';

export const TIPI_BIGLIETTO: TipoBiglietto[] = ['resoconto', 'copiaCucina', 'scontrinoBanco'];

export const NOME_BIGLIETTO: Record<TipoBiglietto, string> = {
  resoconto: 'Resoconto per il cliente',
  copiaCucina: 'Copia cucina',
  scontrinoBanco: 'Scontrino dei banchi',
};

export const SPIEGAZIONE_BIGLIETTO: Record<TipoBiglietto, string> = {
  resoconto: 'Lo stampa la cassa alla conferma e lo dà al cliente, che lo porta a pagare.',
  copiaCucina: 'Esce in Distribuzione, segue il vassoio e si legge col lettore prima di portarlo al tavolo.',
  scontrinoBanco:
    'Esce a BAR e a BEVANDE a ogni incasso. È uno solo per tutti e due i banchi: il banco si riconosce dal numero (BAR0001, BEV0001).',
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
  scontrinoBanco: ['codice', 'totale'],
};

/** La disposizione di partenza, e quella a cui si torna col tasto
 * "Ripristina": gli stessi fogli di prima, su A5 orizzontale. */
export const BIGLIETTI_INIZIALI: Record<TipoBiglietto, Biglietto> = {
  resoconto: {
    id: 'resoconto',
    formato: 'a5-orizzontale',
    margineMm: 10,
    blocchi: [
      // Tavolo e coperti stanno nell'intestazione, a destra del nome della
      // sagra e scritti grandi: sono la prima cosa che si cerca sul foglio,
      // sia al banco sia quando il vassoio va portato via.
      { id: 'testata', tipo: 'titolo', attivo: true, colonna: 'sinistra', testo: 'Sagra di Mazzocco', grandezza: 'grande', allineamento: 'sinistra', grassetto: true },
      { id: 'sottotitolo', tipo: 'testo', attivo: true, colonna: 'sinistra', testo: 'Resoconto ordine', grandezza: 'piccolo', allineamento: 'sinistra' },
      { id: 'tavolo', tipo: 'tavolo', attivo: true, colonna: 'destra', grandezza: 'grande', allineamento: 'destra', grassetto: true, mostraCoperti: true },
      { id: 'riga-testata', tipo: 'riga', attivo: true, colonna: 'intera' },
      { id: 'voci', tipo: 'voci', attivo: true, colonna: 'sinistra', mostraPrezzi: true, caselleSpunta: false },
      { id: 'totale', tipo: 'totale', attivo: true, colonna: 'sinistra', grandezza: 'grande', allineamento: 'destra' },
      { id: 'codice', tipo: 'codice', attivo: true, colonna: 'destra', grandezza: 'gigante', allineamento: 'centro', grassetto: true },
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
  // Lo scontrino del banco: niente tavolo, niente codice a barre — non lo
  // legge nessun lettore, serve al cliente che vuole il conto in mano.
  scontrinoBanco: {
    id: 'scontrinoBanco',
    formato: 'a5-orizzontale',
    margineMm: 10,
    blocchi: [
      { id: 'testata', tipo: 'titolo', attivo: true, colonna: 'sinistra', testo: 'Sagra di Mazzocco', grandezza: 'grande', allineamento: 'sinistra', grassetto: true },
      { id: 'sottotitolo', tipo: 'testo', attivo: true, colonna: 'sinistra', testo: 'Scontrino', grandezza: 'piccolo', allineamento: 'sinistra' },
      { id: 'codice', tipo: 'codice', attivo: true, colonna: 'destra', grandezza: 'enorme', allineamento: 'destra', grassetto: true },
      { id: 'riga-testata', tipo: 'riga', attivo: true, colonna: 'intera' },
      { id: 'voci', tipo: 'voci', attivo: true, colonna: 'intera', mostraPrezzi: true, caselleSpunta: false },
      { id: 'totale', tipo: 'totale', attivo: true, colonna: 'intera', grandezza: 'grande', allineamento: 'destra' },
      { id: 'saluto', tipo: 'testo', attivo: false, colonna: 'intera', testo: 'Grazie!', grandezza: 'normale', allineamento: 'centro' },
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
export type RuoloComande =
  | 'cassa'
  | 'cucina'
  | 'griglia'
  | 'bar'
  | 'distribuzione'
  | 'bancoBar'
  | 'bancoBevande';

export const RUOLI_COMANDE: RuoloComande[] = [
  'cassa',
  'cucina',
  'griglia',
  'bar',
  'distribuzione',
  'bancoBar',
  'bancoBevande',
];

/** "Bar" da solo è il pannello di chi prepara le bevande per gli ordini dei
 * tavoli, che esisteva prima dei banchi: i due ruoli nuovi dicono "banco" per
 * non confondersi con lui nell'elenco delle caselle. */
export const NOME_RUOLO_COMANDE: Record<RuoloComande, string> = {
  cassa: 'Cassa',
  cucina: 'Cucina',
  griglia: 'Griglia',
  bar: 'Bar',
  distribuzione: 'Distribuzione',
  bancoBar: 'Banco BAR',
  bancoBevande: 'Banco BEVANDE',
};

/** Il ruolo che apre ciascun banco. L'amministratore entra comunque ovunque. */
export const RUOLO_BANCO: Record<Banco, RuoloComande> = {
  bar: 'bancoBar',
  bevande: 'bancoBevande',
};

/** Una chiave per app, con i ruoli che la persona ricopre in quell'app: alla
 * sagra i volontari si danno il cambio tra postazioni, quindi possono averne
 * più di uno. Chiave assente o elenco vuoto = nessun accesso a quell'app.
 * Magazzino e Contabilità si aggiungeranno qui quando verranno costruite. */
export interface Accessi {
  comande?: RuoloComande[];
  contabilita?: RuoloContabilita[];
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
  pagamento?: MetodoPagamento;
  serataId: string;
  items: ItemOrdineRichiesta[];
  /** Obbligatori: finiscono sulla copia cucina, l'inserviente deve sapere dove
   * portare il vassoio. */
  tavolo: number;
  coperti: number;
}

export interface ConfermaOrdineRichiesta {
  pagamento?: MetodoPagamento;
  serataId: string;
  numero: number;
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

export interface SegnaComandaStampataRichiesta {
  serataId: string;
  sottoOrdineId: string;
}

export interface SegnaComandaStampataRisposta {
  sottoOrdineId: string;
  /** Vero solo per chi se l'è presa per primo: gli altri non stampano. */
  daStampare: boolean;
}

export interface CreaOrdineBancoRichiesta {
  pagamento?: MetodoPagamento;
  serataId: string;
  banco: Banco;
  items: ItemOrdineRichiesta[];
}

export interface CreaOrdineBancoRisposta {
  ordineId: string;
  numero: number;
  codice: string;
  totale: number;
}

export interface AnnullaOrdineBancoRichiesta {
  serataId: string;
  ordineId: string;
}

export interface AnnullaOrdineBancoRisposta {
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

// ---------------------------------------------------------------------------
// Le segnalazioni dai bagni
//
// Un cartello con un QR in ogni bagno: il cliente lo inquadra, tocca cosa non
// va e se ne va. Non c'è niente da scrivere e niente da gestire — l'elenco
// delle cose segnalabili sta qui nel codice, non in una schermata di
// amministrazione, perché sono sempre quelle e un elenco da mantenere è un
// elenco che nessuno mantiene.
//
// L'avviso compare su tutti gli schermi del personale, qualunque schermata
// stiano guardando: chi ha un attimo ci va.
// ---------------------------------------------------------------------------

export type Bagno = 'uomini' | 'donne' | 'disabile';

export const BAGNI: Bagno[] = ['uomini', 'donne', 'disabile'];

export const NOME_BAGNO: Record<Bagno, string> = {
  uomini: 'Uomini',
  donne: 'Donne',
  disabile: 'Disabili',
};

export type TipoSegnalazione = 'carta' | 'sapone' | 'pulizia' | 'water' | 'acqua' | 'cestino' | 'altro';

/** Quello che il cliente può segnalare, nell'ordine in cui compare sul suo
 * telefono. Le prime due sono le più frequenti e stanno in cima: chi ha
 * fretta tocca senza leggere tutto. */
export const SEGNALAZIONI_BAGNO: { id: TipoSegnalazione; testo: string }[] = [
  { id: 'carta', testo: 'Manca la carta igienica' },
  { id: 'sapone', testo: 'Manca il sapone' },
  { id: 'pulizia', testo: 'Bagno da pulire' },
  { id: 'water', testo: 'Water intasato' },
  { id: 'acqua', testo: 'Acqua per terra' },
  { id: 'cestino', testo: 'Cestino pieno' },
  { id: 'altro', testo: 'Altro problema' },
];

export const TESTO_SEGNALAZIONE: Record<TipoSegnalazione, string> = Object.fromEntries(
  SEGNALAZIONI_BAGNO.map((voce) => [voce.id, voce.testo])
) as Record<TipoSegnalazione, string>;

/** Per quanti minuti una segnalazione uguale (stesso bagno, stessa cosa) non
 * ne crea una nuova. Il QR è appeso in un bagno pubblico e lo inquadra
 * chiunque: senza questo, basterebbe un ragazzino annoiato per riempire di
 * avvisi tutti gli schermi della sagra. Chi segnala non se ne accorge — gli
 * si risponde "grazie" lo stesso. */
export const MINUTI_SEGNALAZIONE_DOPPIA = 5;

export interface SegnalazioneBagno {
  id: string;
  serataId: string;
  bagno: Bagno;
  tipo: TipoSegnalazione;
  /** Il testo com'era quando è stata mandata: se un domani si cambia una voce
   * dell'elenco, le segnalazioni vecchie continuano a dire quello che dicevano. */
  testo: string;
  createdAt: FirestoreTimestampLike;
  /** Quando qualcuno ha premuto "Ci penso io": da quel momento l'avviso
   * sparisce da tutti gli schermi, così non ci vanno in due. */
  presaInCaricoAt: FirestoreTimestampLike | null;
  presaInCaricoDa: string | null;
}

export interface SegnalaBagnoRichiesta {
  serataId: string;
  bagno: Bagno;
  tipo: TipoSegnalazione;
}

export interface SegnalaBagnoRisposta {
  segnalazioneId: string;
  /** Vero quando la stessa cosa era già stata segnalata da poco: non se ne
   * crea una seconda. */
  giaSegnalata: boolean;
}

export interface PrendiSegnalazioneRichiesta {
  serataId: string;
  segnalazioneId: string;
}

export interface PrendiSegnalazioneRisposta {
  segnalazioneId: string;
}

// ---------------------------------------------------------------------------
// La contabilità
//
// Le entrate le produce già Comande: ordini dei tavoli e scontrini dei banchi,
// con dentro tutto il dettaglio. Qui c'è quello che Comande non sa — le spese,
// le entrate che non passano dalla cassa, i soldi contati davvero a fine
// serata e chi c'era a lavorare — più il modo di tenere insieme le serate di
// una stessa sagra.
// ---------------------------------------------------------------------------

export type RuoloContabilita = 'contabile';

export const RUOLI_CONTABILITA: RuoloContabilita[] = ['contabile'];

export const NOME_RUOLO_CONTABILITA: Record<RuoloContabilita, string> = {
  contabile: 'Contabile',
};

/** Un'edizione della sagra: le serate di un anno, più tutto quello che si
 * spende e si incassa fuori dalle serate. Serve a due cose che senza di lei
 * non si possono fare: attribuire le spese che non sono di una sera sola (la
 * tensostruttura non è di martedì) e confrontare un anno con quello prima. */
export interface Edizione {
  /** L'anno, che è anche l'id: "2027". */
  id: string;
  nome: string;
  /** Prima e ultima serata, in formato AAAA-MM-GG. Le serate dentro questo
   * intervallo appartengono all'edizione. */
  dal: string;
  al: string;
  chiusa: boolean;
}

export type CategoriaUscita =
  | 'fornitori-cibo'
  | 'fornitori-bevande'
  | 'attrezzature'
  | 'service'
  | 'permessi'
  | 'utenze'
  | 'consumo'
  | 'altro';

export const CATEGORIE_USCITA: { id: CategoriaUscita; nome: string }[] = [
  { id: 'fornitori-cibo', nome: 'Fornitori cibo' },
  { id: 'fornitori-bevande', nome: 'Fornitori bevande' },
  { id: 'attrezzature', nome: 'Attrezzature e affitti' },
  { id: 'service', nome: 'Service e allestimenti' },
  { id: 'permessi', nome: 'Permessi, SIAE, assicurazioni' },
  { id: 'utenze', nome: 'Utenze' },
  { id: 'consumo', nome: 'Materiale di consumo' },
  { id: 'altro', nome: 'Altro' },
];

export const NOME_CATEGORIA_USCITA: Record<CategoriaUscita, string> = Object.fromEntries(
  CATEGORIE_USCITA.map((c) => [c.id, c.nome])
) as Record<CategoriaUscita, string>;

export type CategoriaEntrata = 'sponsor' | 'lotteria' | 'bancarelle' | 'quote' | 'offerte' | 'altro';

export const CATEGORIE_ENTRATA: { id: CategoriaEntrata; nome: string }[] = [
  { id: 'sponsor', nome: 'Sponsor' },
  { id: 'lotteria', nome: 'Lotteria e pesca' },
  { id: 'bancarelle', nome: 'Bancarelle' },
  { id: 'quote', nome: 'Quote' },
  { id: 'offerte', nome: 'Offerte' },
  { id: 'altro', nome: 'Altro' },
];

export const NOME_CATEGORIA_ENTRATA: Record<CategoriaEntrata, string> = Object.fromEntries(
  CATEGORIE_ENTRATA.map((c) => [c.id, c.nome])
) as Record<CategoriaEntrata, string>;

/** Una spesa. Vive sotto l'edizione, non sotto la serata, perché quasi nessuna
 * spesa è di una sera sola: `serataId` la lega a una serata solo quando ha
 * davvero senso (il ghiaccio di sabato), altrimenti resta dell'evento. */
export interface Uscita {
  id: string;
  edizioneId: string;
  categoria: CategoriaUscita;
  descrizione: string;
  fornitore: string;
  /** In euro. */
  importo: number;
  /** Quando è stata sostenuta, AAAA-MM-GG. */
  data: string;
  /** Serata a cui appartiene, oppure null = spesa dell'evento intero. */
  serataId: string | null;
  /** Falso finché è solo un preventivo: si inseriscono prima della sagra e si
   * spuntano quando diventano vere. Un preventivo non entra nell'utile. */
  pagata: boolean;
  /** Foto dello scontrino o della fattura, in `immagini`. */
  immagineId: string | null;
  createdAt: FirestoreTimestampLike;
}

/** Un'entrata che non passa dalla cassa: sponsor, lotteria, bancarelle. */
export interface EntrataExtra {
  id: string;
  edizioneId: string;
  categoria: CategoriaEntrata;
  descrizione: string;
  importo: number;
  data: string;
  serataId: string | null;
  incassata: boolean;
  immagineId: string | null;
  createdAt: FirestoreTimestampLike;
}

/** I punti in cui si incassa, e che a fine serata vanno contati uno per uno:
 * le casse dei tavoli (una per lettera) e i due banchi. */
export interface PuntoCassa {
  /** "cassa-A", "banco-bar". */
  id: string;
  nome: string;
}

/** Il conteggio di fine serata di un punto cassa. Sta sotto la serata: è un
 * fatto di quella sera. */
export interface ChiusuraCassa {
  id: string;
  serataId: string;
  puntoId: string;
  /** I soldi messi nel cassetto prima di cominciare, che non sono incasso. */
  fondoCassa: number;
  /** Quanto c'era davvero nel cassetto, fondo compreso. */
  contatoContanti: number;
  /** Quanto dice il terminale POS. */
  contatoElettronico: number;
  note: string;
  aggiornatoAt: FirestoreTimestampLike;
  aggiornatoDa: string;
}

/** Chi c'era a lavorare, sera per sera. Una spunta e nient'altro: se chiedessi
 * gli orari di entrata e uscita non lo compilerebbe nessuno. */
export interface Presenza {
  /** Lo stesso uid dell'account, così una persona è una riga sola. */
  uid: string;
  serataId: string;
  nome: string;
  presente: boolean;
  /** Mezza serata pesa mezzo: chi arriva alle dieci non ha fatto la serata. */
  meta: boolean;
  aggiornatoAt: FirestoreTimestampLike;
}

/** Quanto pesa una presenza nel conto della resa per volontario. */
export function pesoPresenza(presenza: { presente: boolean; meta: boolean }): number {
  if (!presenza.presente) return 0;
  return presenza.meta ? 0.5 : 1;
}

/** Di quante ore la serata "sborda" oltre la mezzanotte.
 *
 * Una sagra non finisce a mezzanotte: alle 00:30 si sta ancora servendo, e
 * quell'ordine appartiene alla sera prima — non a una serata nuova aperta da
 * dieci minuti. Due ore è il compromesso: copre la coda del servizio e le
 * pulizie, e nessuno batte un ordine alle tre di notte.
 *
 * Prima questa cosa succedeva per caso, perché la data si prendeva dall'ora di
 * Greenwich e l'Italia d'estate è avanti di due: stesso risultato, ma non
 * voluto. Ora è una scelta scritta, e i soldi della contabilità ci si
 * appoggiano sopra. */
export const ORE_CODA_SERATA = 2;

/** L'id della serata (AAAA-MM-GG) a cui appartiene un momento. */
export function idSerata(momento: Date = new Date()): string {
  const spostato = new Date(momento.getTime() - ORE_CODA_SERATA * 60 * 60 * 1000);
  const anno = spostato.getFullYear();
  const mese = String(spostato.getMonth() + 1).padStart(2, '0');
  const giorno = String(spostato.getDate()).padStart(2, '0');
  return `${anno}-${mese}-${giorno}`;
}

/** L'id dell'edizione a cui appartiene una serata: l'anno della sua data.
 * Una sagra che scavallasse il capodanno non esiste. */
export function edizioneDiSerata(serataId: string): string {
  return serataId.slice(0, 4);
}
