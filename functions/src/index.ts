// Cloud Functions per la logica di business condivisa del sistema Sagra di
// Mazzocco: numerazione ordini, generazione sotto-ordini per settore,
// transizioni di stato. Tutte le scritture su ordini/sottoOrdini passano di
// qui (i client non possono scrivere direttamente, vedi firestore.rules).

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import {
  getFirestore,
  FieldValue,
  Transaction,
  DocumentReference,
  Timestamp,
} from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { onCall, HttpsError, CallableOptions, CallableRequest } from 'firebase-functions/v2/https';
import {
  Permessi,
  RuoloComande,
  Utente,
  REGOLA_NOME_UTENTE,
  emailDaNomeUtente,
  InizializzaSistemaRichiesta,
  InizializzaSistemaRisposta,
  CreaUtenteRichiesta,
  AggiornaAnagraficaRichiesta,
  AnnoRichiesta,
  ArchivioEdizione,
  AzzeraEdizioneRichiesta,
  DocumentoArchiviato,
  OperazioneArchivioRisposta,
  RicaricaEdizioneRichiesta,
  RiepilogoEdizione,
  RiepilogoEdizioniRisposta,
  VERSIONE_ARCHIVIO,
  percorsoDellEdizione,
  ImpostaRuoloRichiesta,
  type Ruolo,
  RUOLI,
  permessiDelRuolo,
  nomeCompleto,
  ReimpostaPasswordRichiesta,
  ImpostaAttivoRichiesta,
  EliminaUtenteRichiesta,
  UtenteRisposta,
  RUOLI_COMANDE,
  Ordine,
  SottoOrdine,
  Prodotto,
  Serata,
  ItemOrdine,
  ItemSottoOrdine,
  Componente,
  ComponenteSottoOrdine,
  Settore,
  PREFISSO_SETTORE,
  ItemOrdineRichiesta,
  CreaOrdineRisposta,
  CreaOrdineBozzaRichiesta,
  CreaOrdineCassaRichiesta,
  ConfermaOrdineRichiesta,
  SegnaSottoOrdineProntoRichiesta,
  SegnaSottoOrdineProntoRisposta,
  ConsegnaSottoOrdineRichiesta,
  ConsegnaSottoOrdineRisposta,
  AnnullaOrdineRichiesta,
  AnnullaOrdineRisposta,
  ApriSerataRichiesta,
  ApriSerataRisposta,
  DisponibilitaProdotto,
  ImpostaPorzioniRichiesta,
  SegnaEsauritoRichiesta,
  ProdottoRisposta,
  SegnaCopiaCucinaStampataRichiesta,
  SegnaCopiaCucinaStampataRisposta,
  ChiudiOrdineRichiesta,
  ChiudiOrdineRisposta,
  leggiCodiceBarre,
  ImpostaLetteraCassaRichiesta,
  REGOLA_LETTERA_CASSA,
  formattaCodiceOrdine,
  componiCodiceBarre,
  Banco,
  BANCHI,
  RUOLO_BANCO,
  BANCO_CON_COMANDE,
  SETTORE_DEL_BANCO,
  NOME_BANCO,
  ProdottoBanco,
  ItemOrdineBanco,
  OrdineBanco,
  formattaCodiceBanco,
  CreaOrdineBancoRichiesta,
  CreaOrdineBancoRisposta,
  SegnaComandaStampataRichiesta,
  SegnaComandaStampataRisposta,
  AnnullaOrdineBancoRichiesta,
  AnnullaOrdineBancoRisposta,
  MetodoPagamento,
  METODI_PAGAMENTO,
  Bagno,
  BAGNI,
  TipoSegnalazione,
  TESTO_SEGNALAZIONE,
  MINUTI_SEGNALAZIONE_DOPPIA,
  SegnalazioneBagno,
  SegnalaBagnoRichiesta,
  SegnalaBagnoRisposta,
  PrendiSegnalazioneRichiesta,
  PrendiSegnalazioneRisposta,
} from '@sagra-mazzocco/shared';

initializeApp();
const db = getFirestore();

const CODICE_INIZIALIZZAZIONE = defineString('CODICE_INIZIALIZZAZIONE');

/** Impostazioni comuni a tutte le funzioni.
 *
 * `invoker: 'public'` non vuol dire "chiunque può fare quello che vuole": le
 * funzioni chiamabili devono essere raggiungibili dal browser, e il controllo
 * di chi sta chiamando lo fa il codice qui dentro (richiedeRuoloComande e
 * compagnia). Senza questo, dal sito pubblicato ogni chiamata veniva
 * respinta prima di arrivare al codice, con un errore di CORS.
 *
 * `maxInstances` è un tetto di spesa: anche in caso di errore o di abuso, il
 * progetto non può moltiplicare le copie del server all'infinito. */
const CHIAMABILE: CallableOptions = { invoker: 'public', maxInstances: 10 };

// ---------------------------------------------------------------------------
// Helper condivisi
// ---------------------------------------------------------------------------

/** I permessi sono "custom claims" dell'account, impostabili solo dal server:
 * il client non può falsificarli. L'amministratore generale può sempre tutto;
 * senza ruoli ammessi l'operazione è riservata a lui. */
function richiedeRuoloComande(
  request: CallableRequest,
  ...ammessi: RuoloComande[]
): { amministratore: boolean; ruoli: RuoloComande[] } {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Operazione riservata al personale: effettua l’accesso.');
  }
  const permessi = request.auth.token as Permessi;
  const ruoli = Array.isArray(permessi.comande) ? permessi.comande : [];
  if (permessi.amministratore === true) return { amministratore: true, ruoli };
  if (ruoli.some((ruolo) => ammessi.includes(ruolo))) return { amministratore: false, ruoli };
  throw new HttpsError('permission-denied', 'Il tuo ruolo non permette questa operazione.');
}

function richiedeAmministratore(request: CallableRequest): string {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Operazione riservata: effettua l’accesso.');
  }
  if ((request.auth.token as Permessi).amministratore !== true) {
    throw new HttpsError('permission-denied', 'Operazione riservata all’amministratore.');
  }
  return request.auth.uid;
}

/** Impedisce all'unico amministratore di togliersi i permessi o di
 * disattivarsi, lasciando il sistema senza nessuno che possa gestirlo. */
function vietaAutoBlocco(uidRichiedente: string, uidBersaglio: string, azione: string): void {
  if (uidRichiedente === uidBersaglio) {
    throw new HttpsError('failed-precondition', `Non puoi ${azione} sul tuo stesso account.`);
  }
}

/** Vuoto = nessuna lettera. Le minuscole si accettano e si alzano. */
function validaLetteraCassa(valore: unknown): string | null {
  if (valore === null || valore === undefined || valore === '') return null;
  const lettera = typeof valore === 'string' ? valore.trim().toUpperCase() : '';
  if (!REGOLA_LETTERA_CASSA.test(lettera)) {
    throw new HttpsError('invalid-argument', 'La lettera della cassa deve essere una sola lettera, dalla A alla Z.');
  }
  return lettera;
}

function validaTesto(valore: unknown, nomeCampo: string): string {
  if (typeof valore !== 'string' || !valore.trim()) {
    throw new HttpsError('invalid-argument', `${nomeCampo} mancante.`);
  }
  return valore.trim();
}

function validaRuolo(valore: unknown): Ruolo {
  if (!RUOLI.includes(valore as Ruolo)) {
    throw new HttpsError('invalid-argument', `Ruolo non valido: ${String(valore)}.`);
  }
  return valore as Ruolo;
}

function validaNomeUtente(valore: unknown): string {
  const nomeUtente = typeof valore === 'string' ? valore.trim().toLowerCase() : '';
  if (!nomeUtente) throw new HttpsError('invalid-argument', 'Nome utente mancante: serve a chi entra nelle app.');
  if (!REGOLA_NOME_UTENTE.test(nomeUtente)) {
    throw new HttpsError(
      'invalid-argument',
      'Nome utente non valido: da 3 a 30 caratteri tra lettere minuscole, numeri, punto, trattino e trattino basso.'
    );
  }
  return nomeUtente;
}

function validaPassword(valore: unknown): string {
  if (typeof valore !== 'string' || valore.length < 8) {
    throw new HttpsError('invalid-argument', 'La password deve avere almeno 8 caratteri.');
  }
  return valore;
}

/** I permessi del ruolo, nella forma in cui si scrivono sul profilo. */
function campiDelRuolo(ruolo: Ruolo): Pick<Utente, 'ruolo' | 'amministratore' | 'accessi'> {
  const permessi = permessiDelRuolo(ruolo);
  return {
    ruolo,
    amministratore: permessi.amministratore === true,
    accessi: {
      ...(permessi.comande ? { comande: permessi.comande } : {}),
      ...(permessi.contabilita ? { contabilita: permessi.contabilita } : {}),
    },
  };
}

/** Crea l'account di accesso con un uid già deciso: quello della riga della
 * persona, così chi riceve un accesso dopo essere stato "solo presenze" resta
 * la stessa persona. Imposta anche i permessi del ruolo. */
async function creaAccesso(dati: { uid: string; nomeUtente: string; password: string; nome: string; ruolo: Ruolo }): Promise<void> {
  try {
    await getAuth().createUser({
      uid: dati.uid,
      email: emailDaNomeUtente(dati.nomeUtente),
      password: dati.password,
      displayName: dati.nome,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', `Il nome utente "${dati.nomeUtente}" è già in uso.`);
    }
    throw err;
  }
  await getAuth().setCustomUserClaims(dati.uid, permessiDelRuolo(dati.ruolo));
}

async function creaPersona(dati: {
  nome: string;
  cognome: string;
  ruolo: Ruolo;
  nomeUtente?: unknown;
  password?: unknown;
  letteraCassa?: string | null;
}): Promise<string> {
  const uid = db.collection('utenti').doc().id;
  const conAccesso = dati.ruolo !== 'nessuno';
  const nomeUtente = conAccesso ? validaNomeUtente(dati.nomeUtente) : null;
  if (nomeUtente) {
    await creaAccesso({
      uid,
      nomeUtente,
      password: validaPassword(dati.password),
      nome: nomeCompleto(dati),
      ruolo: dati.ruolo,
    });
  }

  const utente: Utente = {
    uid,
    nomeUtente,
    nome: dati.nome,
    cognome: dati.cognome,
    ...campiDelRuolo(dati.ruolo),
    // La lettera serve solo a chi incassa: a chi non ha accesso non si dà.
    letteraCassa: conAccesso ? (dati.letteraCassa ?? null) : null,
    attivo: true,
    createdAt: FieldValue.serverTimestamp() as unknown as Utente['createdAt'],
  };
  await db.doc(`utenti/${uid}`).set(utente);
  return uid;
}

async function leggiPersona(uid: string): Promise<Utente> {
  const snapshot = await db.doc(`utenti/${uid}`).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Persona inesistente.');
  return snapshot.data() as Utente;
}

function validaItemsRichiesti(items: unknown): ItemOrdineRichiesta[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new HttpsError('invalid-argument', "L'ordine deve contenere almeno un prodotto.");
  }
  return items.map((item) => {
    const { prodottoId, quantita } = (item ?? {}) as ItemOrdineRichiesta;
    if (typeof prodottoId !== 'string' || !prodottoId) {
      throw new HttpsError('invalid-argument', 'Prodotto non valido.');
    }
    if (typeof quantita !== 'number' || !Number.isInteger(quantita) || quantita <= 0) {
      throw new HttpsError('invalid-argument', `Quantità non valida per il prodotto ${prodottoId}.`);
    }
    return { prodottoId, quantita };
  });
}

function validaInteroPositivo(valore: unknown, nomeCampo: string): number {
  if (typeof valore !== 'number' || !Number.isInteger(valore) || valore <= 0) {
    throw new HttpsError('invalid-argument', `${nomeCampo} non valido.`);
  }
  return valore;
}

interface RigaDisponibilita {
  prodottoRef: DocumentReference;
  disponibilitaRef: DocumentReference;
  prodotto: Prodotto;
  disponibilita: DisponibilitaProdotto;
  quantita: number;
}

function refDisponibilita(serataId: string, prodottoId: string): DocumentReference {
  return db.doc(`serate/${serataId}/disponibilita/${prodottoId}`);
}

/** Legge i prodotti richiesti da Firestore (dentro la transazione) e costruisce
 * gli item dell'ordine usando SEMPRE nome/prezzo/settore presi dal database:
 * i valori eventualmente inviati dal client per questi campi vengono ignorati,
 * altrimenti chiunque potrebbe alterare i prezzi di un ordine pubblico da QR.
 * Verifica anche che le porzioni della serata bastino: non si vendono mezzi
 * ordini, quindi chi ne chiede più di quante ne restano viene rifiutato. */
async function costruisciItemsOrdine(
  transaction: Transaction,
  serataId: string,
  itemsRichiesti: ItemOrdineRichiesta[]
): Promise<{ items: ItemOrdine[]; totale: number; righe: RigaDisponibilita[] }> {
  const items: ItemOrdine[] = [];
  const righe: RigaDisponibilita[] = [];
  let totale = 0;

  for (const richiesto of itemsRichiesti) {
    const prodottoRef = db.collection('prodotti').doc(richiesto.prodottoId);
    const snapshot = await transaction.get(prodottoRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Prodotto inesistente: ${richiesto.prodottoId}.`);
    }
    const prodotto = snapshot.data() as Prodotto;
    if (prodotto.esauritoSerata === serataId) {
      throw new HttpsError('failed-precondition', `Abbiamo appena terminato: ${prodotto.nome}.`);
    }

    const disponibilitaRef = refDisponibilita(serataId, richiesto.prodottoId);
    const snapshotDisponibilita = await transaction.get(disponibilitaRef);
    const disponibilita = (snapshotDisponibilita.data() as DisponibilitaProdotto | undefined) ?? {
      prodottoId: richiesto.prodottoId,
      porzioniMassime: null,
      venduti: 0,
    };

    if (disponibilita.porzioniMassime !== null) {
      const rimaste = disponibilita.porzioniMassime - disponibilita.venduti;
      if (rimaste <= 0) {
        throw new HttpsError('failed-precondition', `Abbiamo appena terminato: ${prodotto.nome}.`);
      }
      if (richiesto.quantita > rimaste) {
        throw new HttpsError(
          'failed-precondition',
          `Di ${prodotto.nome} ${rimaste === 1 ? 'resta solo 1 porzione' : `restano solo ${rimaste} porzioni`}.`
        );
      }
    }

    items.push({
      prodottoId: richiesto.prodottoId,
      nome: prodotto.nome,
      settore: prodotto.settore,
      prezzo: prodotto.prezzo,
      quantita: richiesto.quantita,
    });
    righe.push({ prodottoRef, disponibilitaRef, prodotto, disponibilita, quantita: richiesto.quantita });
    totale += prodotto.prezzo * richiesto.quantita;
  }

  return { items, totale, righe };
}

/** Scala le porzioni: si fa al pagamento, non quando il cliente invia la
 * bozza dal tavolo, altrimenti le bozze mai pagate terrebbero bloccate
 * porzioni vendibili. Al raggiungimento del massimo il piatto risulta finito
 * per la serata. */
function scalaPorzioni(transaction: Transaction, serataId: string, righe: RigaDisponibilita[]): void {
  for (const riga of righe) {
    const venduti = riga.disponibilita.venduti + riga.quantita;
    const aggiornata: DisponibilitaProdotto = { ...riga.disponibilita, venduti };
    transaction.set(riga.disponibilitaRef, aggiornata);
    if (riga.disponibilita.porzioniMassime !== null && venduti >= riga.disponibilita.porzioniMassime) {
      transaction.update(riga.prodottoRef, { esauritoSerata: serataId });
    }
  }
}

/** Legge la serata (dentro la transazione) e verifica che sia aperta. Non
 * scrive nulla: l'incremento del contatore va fatto DOPO tutte le altre
 * letture della stessa transazione (Firestore vuole tutte le get prima di
 * qualsiasi set/update). */
async function leggiSerataAperta(
  transaction: Transaction,
  serataId: string
): Promise<{
  ref: DocumentReference;
  contatoreOrdini: number;
  contatoriCassa: Record<string, number>;
  contatoriBanco: Record<string, number>;
}> {
  const ref = db.collection('serate').doc(serataId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Serata inesistente.');
  }
  const serata = snapshot.data() as Serata;
  if (!serata.aperta) {
    throw new HttpsError('failed-precondition', 'La serata è chiusa.');
  }
  return {
    ref,
    contatoreOrdini: serata.contatoreOrdini,
    contatoriCassa: serata.contatoriCassa ?? {},
    contatoriBanco: serata.contatoriBanco ?? {},
  };
}

/** La lettera di cassa di chi sta battendo l'ordine, letta dal suo profilo
 * (dentro la transazione, prima di ogni scrittura). Senza lettera l'ordine non
 * si può numerare, quindi si rifiuta con un messaggio che dice cosa fare. */
async function leggiLetteraCassa(transaction: Transaction, uid: string): Promise<string> {
  const snapshot = await transaction.get(db.doc(`utenti/${uid}`));
  const lettera = (snapshot.data() as Utente | undefined)?.letteraCassa;
  if (!lettera) {
    throw new HttpsError(
      'failed-precondition',
      'Al tuo account non è stata assegnata la lettera della cassa (A, B…): chiedi all’amministratore di impostarla nell’app Utenti.'
    );
  }
  return lettera;
}

/** Il prossimo numero di comanda della cassa. Va chiamata dopo tutte le letture
 * della transazione: scrive il contatore aggiornato. */
function prossimoCodiceOrdine(
  transaction: Transaction,
  serata: { ref: DocumentReference; contatoriCassa: Record<string, number> },
  lettera: string
): { numero: number; codice: string; codiceBarre: string } {
  const numero = (serata.contatoriCassa[lettera] ?? 0) + 1;
  transaction.update(serata.ref, { [`contatoriCassa.${lettera}`]: numero });
  const codice = formattaCodiceOrdine(lettera, numero);
  return { numero, codice, codiceBarre: componiCodiceBarre(codice, dataOraItaliana(new Date()), lettera) };
}

/** Data (AAAAMMGG) e ora (HHMM) come le legge chi è alla sagra: il server
 * gira sull'ora di Greenwich, il foglio deve riportare quella italiana. */
function dataOraItaliana(istante: Date): { data: string; ora: string } {
  const parti = Object.fromEntries(
    new Intl.DateTimeFormat('it-IT', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(istante)
      .map((p) => [p.type, p.value])
  );
  return { data: `${parti.year}${parti.month}${parti.day}`, ora: `${parti.hour}${parti.minute}` };
}

function formattaCodice(settore: Settore, codiceOrdine: string): string {
  return `${PREFISSO_SETTORE[settore]}${codiceOrdine}`;
}

/** Legge tutti i componenti (dentro la transazione, prima di ogni scrittura):
 * servono a sapere quale settore prepara ciascuna parte di un piatto. Sono
 * poche decine di documenti. */
async function leggiComponenti(transaction: Transaction): Promise<Map<string, Componente>> {
  const snapshot = await transaction.get(db.collection('componenti'));
  return new Map(snapshot.docs.map((doc) => [doc.id, doc.data() as Componente]));
}

/** Evita code come 1.5000000000000002 dovute ai conti con i decimali. */
function arrotondaQuantita(valore: number): number {
  return Math.round(valore * 1000) / 1000;
}

interface LavoroSettore {
  piatti: Map<string, ItemSottoOrdine>;
  componenti: Map<string, ComponenteSottoOrdine>;
}

/** Scompone l'ordine nel lavoro di ciascun settore e crea, dentro la
 * transazione, un sotto-ordine per ogni settore coinvolto.
 *
 * Un piatto con composizione dà lavoro ai settori dei suoi componenti (una
 * grigliata con patatine va sia alla griglia sia in cucina); un piatto senza
 * composizione resta un pezzo unico nel settore assegnato al piatto. */
function generaSottoOrdini(
  transaction: Transaction,
  serataId: string,
  ordineId: string,
  numero: number,
  codiceOrdine: string,
  righe: { prodotto: Prodotto; quantita: number }[],
  componenti: Map<string, Componente>
): void {
  const perSettore = new Map<Settore, LavoroSettore>();

  function aggiungi(settore: Settore, prodotto: Prodotto, quantitaPiatti: number, parte: ComponenteSottoOrdine) {
    const lavoro = perSettore.get(settore) ?? { piatti: new Map(), componenti: new Map() };
    perSettore.set(settore, lavoro);
    // Il piatto compare una volta sola per settore, anche se ci manda più
    // componenti (costicine e salsiccia vanno entrambe alla griglia).
    if (!lavoro.piatti.has(prodotto.id)) {
      lavoro.piatti.set(prodotto.id, { prodottoId: prodotto.id, nome: prodotto.nome, quantita: quantitaPiatti });
    }
    const esistente = lavoro.componenti.get(parte.id);
    lavoro.componenti.set(parte.id, {
      ...parte,
      quantita: arrotondaQuantita((esistente?.quantita ?? 0) + parte.quantita),
    });
  }

  for (const { prodotto, quantita } of righe) {
    const composizione = (prodotto.composizione ?? []).filter((voce) => componenti.has(voce.componenteId));
    if (composizione.length === 0) {
      aggiungi(prodotto.settore, prodotto, quantita, { id: prodotto.id, nome: prodotto.nome, quantita });
      continue;
    }
    for (const voce of composizione) {
      const componente = componenti.get(voce.componenteId)!;
      aggiungi(componente.settore, prodotto, quantita, {
        id: componente.id,
        nome: componente.nome,
        quantita: arrotondaQuantita(voce.quantita * quantita),
      });
    }
  }

  for (const [settore, lavoro] of perSettore) {
    const sottoOrdineRef = db.collection(`serate/${serataId}/sottoOrdini`).doc();
    const sottoOrdine: SottoOrdine = {
      id: sottoOrdineRef.id,
      codice: formattaCodice(settore, codiceOrdine),
      ordineId,
      serataId,
      numeroOrdine: numero,
      settore,
      stato: 'in_preparazione',
      items: [...lavoro.piatti.values()],
      componenti: [...lavoro.componenti.values()],
      createdAt: FieldValue.serverTimestamp() as unknown as SottoOrdine['createdAt'],
      readyAt: null,
      deliveredAt: null,
    };
    transaction.set(sottoOrdineRef, sottoOrdine);
  }
}

// ---------------------------------------------------------------------------
// inizializzaSistema — crea il primo amministratore. Funziona una sola volta
// e solo con il codice segreto configurato sul server (CODICE_INIZIALIZZAZIONE):
// senza queste due condizioni chiunque potrebbe nominarsi amministratore.
// ---------------------------------------------------------------------------

export const inizializzaSistema = onCall(
  CHIAMABILE,
  async (request: CallableRequest<InizializzaSistemaRichiesta>): Promise<InizializzaSistemaRisposta> => {
    const { codice, nomeUtente, nome, password } = request.data ?? ({} as InizializzaSistemaRichiesta);
    const atteso = CODICE_INIZIALIZZAZIONE.value();
    if (!atteso || codice !== atteso) {
      throw new HttpsError('permission-denied', 'Codice di inizializzazione non valido.');
    }

    const configRef = db.doc('config/sistema');
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(configRef);
      if (snapshot.exists && snapshot.data()?.amministratoreCreato) {
        throw new HttpsError('failed-precondition', 'Il sistema è già stato inizializzato.');
      }
      transaction.set(configRef, { amministratoreCreato: true, inizializzatoAt: FieldValue.serverTimestamp() });
    });

    try {
      const uid = await creaPersona({
        nome: validaTesto(nome, 'Nome'),
        cognome: '',
        ruolo: 'amministratore',
        nomeUtente,
        password,
      });
      return { uid };
    } catch (err) {
      // Se la creazione fallisce (es. password troppo corta) si libera il
      // blocco, altrimenti non si potrebbe più riprovare.
      await configRef.delete();
      throw err;
    }
  }
);

// ---------------------------------------------------------------------------
// Gestione utenti (app "Utenti") — tutto riservato all'amministratore.
// Dopo ogni cambio di permessi, password o attivazione le sessioni aperte
// vengono invalidate: chi è collegato deve rientrare e riceve i permessi
// aggiornati, senza aspettare la scadenza del token.
// ---------------------------------------------------------------------------

export const creaUtente = onCall(CHIAMABILE, async (request: CallableRequest<CreaUtenteRichiesta>): Promise<UtenteRisposta> => {
  richiedeAmministratore(request);
  const dati = request.data ?? ({} as CreaUtenteRichiesta);
  const uid = await creaPersona({
    nome: validaTesto(dati.nome, 'Nome'),
    cognome: validaTesto(dati.cognome, 'Cognome'),
    ruolo: validaRuolo(dati.ruolo),
    nomeUtente: dati.nomeUtente,
    password: dati.password,
    letteraCassa: validaLetteraCassa(dati.letteraCassa),
  });
  return { uid };
});

export const aggiornaAnagrafica = onCall(
  CHIAMABILE,
  async (request: CallableRequest<AggiornaAnagraficaRichiesta>): Promise<UtenteRisposta> => {
    richiedeAmministratore(request);
    const { uid } = request.data ?? ({} as AggiornaAnagraficaRichiesta);
    validaTesto(uid, 'Persona');
    const nome = validaTesto(request.data?.nome, 'Nome');
    const cognome = validaTesto(request.data?.cognome, 'Cognome');
    const persona = await leggiPersona(uid);
    await db.doc(`utenti/${uid}`).update({ nome, cognome });
    // Il nome dell'account è quello che le app mostrano in alto: va tenuto pari.
    if (persona.nomeUtente) await getAuth().updateUser(uid, { displayName: nomeCompleto({ nome, cognome }) });
    return { uid };
  }
);

/** La lettera non è un permesso: non cambia cosa la persona può fare, solo
 * come si numerano i suoi ordini. Per questo non serve farla rientrare. */
export const impostaLetteraCassa = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ImpostaLetteraCassaRichiesta>): Promise<UtenteRisposta> => {
    richiedeAmministratore(request);
    const { uid } = request.data ?? ({} as ImpostaLetteraCassaRichiesta);
    validaTesto(uid, 'Utente');
    const letteraCassa = validaLetteraCassa(request.data?.letteraCassa);
    await db.doc(`utenti/${uid}`).update({ letteraCassa });
    return { uid };
  }
);

/** Tre casi, a seconda di dove si parte e dove si arriva:
 * - da "nessuno" a un ruolo: nasce l'account (servono nome utente e password);
 * - da un ruolo a "nessuno": l'account si cancella, la persona resta in elenco
 *   con le sue presenze;
 * - da un ruolo a un altro: cambiano i permessi, e chi era collegato rientra. */
export const impostaRuolo = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ImpostaRuoloRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid } = request.data ?? ({} as ImpostaRuoloRichiesta);
    validaTesto(uid, 'Persona');
    vietaAutoBlocco(uidRichiedente, uid, 'cambiare il ruolo');
    const ruolo = validaRuolo(request.data?.ruolo);
    const persona = await leggiPersona(uid);

    if (ruolo === 'nessuno') {
      if (persona.nomeUtente) await getAuth().deleteUser(uid);
      await db.doc(`utenti/${uid}`).update({ ...campiDelRuolo(ruolo), nomeUtente: null, letteraCassa: null });
      return { uid };
    }

    if (!persona.nomeUtente) {
      const nomeUtente = validaNomeUtente(request.data?.nomeUtente);
      await creaAccesso({ uid, nomeUtente, password: validaPassword(request.data?.password), nome: nomeCompleto(persona), ruolo });
      // Una persona disattivata che riceve un accesso nasce disattivata anche lì.
      if (!persona.attivo) await getAuth().updateUser(uid, { disabled: true });
      await db.doc(`utenti/${uid}`).update({ ...campiDelRuolo(ruolo), nomeUtente });
      return { uid };
    }

    await getAuth().setCustomUserClaims(uid, permessiDelRuolo(ruolo));
    await db.doc(`utenti/${uid}`).update(campiDelRuolo(ruolo));
    await getAuth().revokeRefreshTokens(uid);
    return { uid };
  }
);

export const reimpostaPassword = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ReimpostaPasswordRichiesta>): Promise<UtenteRisposta> => {
    richiedeAmministratore(request);
    const { uid, password } = request.data ?? ({} as ReimpostaPasswordRichiesta);
    validaTesto(uid, 'Utente');
    validaPassword(password);
    if (!(await leggiPersona(uid)).nomeUtente) {
      throw new HttpsError('failed-precondition', 'Questa persona non ha un accesso alle app: prima dalle un ruolo.');
    }
    await getAuth().updateUser(uid, { password });
    await getAuth().revokeRefreshTokens(uid);
    return { uid };
  }
);

/** Disattivare non cancella: la persona resta nello storico delle presenze, ma
 * non entra più nelle app e non compare più nell'appello. */
export const impostaAttivo = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ImpostaAttivoRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid, attivo } = request.data ?? ({} as ImpostaAttivoRichiesta);
    validaTesto(uid, 'Utente');
    vietaAutoBlocco(uidRichiedente, uid, 'cambiare l’attivazione');

    const persona = await leggiPersona(uid);
    if (persona.nomeUtente) {
      await getAuth().updateUser(uid, { disabled: attivo !== true });
      await getAuth().revokeRefreshTokens(uid);
    }
    await db.doc(`utenti/${uid}`).update({ attivo: attivo === true });
    return { uid };
  }
);

/** Cancellazione definitiva: l'account sparisce da Authentication e il suo
 * profilo da Firestore. Gli ordini e le presenze già registrati portano il
 * nome scritto dentro, quindi lo storico resta leggibile. */
export const eliminaUtente = onCall(
  CHIAMABILE,
  async (request: CallableRequest<EliminaUtenteRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid } = request.data ?? ({} as EliminaUtenteRichiesta);
    validaTesto(uid, 'Utente');
    vietaAutoBlocco(uidRichiedente, uid, 'eliminare');

    const persona = await leggiPersona(uid);
    if (persona.nomeUtente) await getAuth().deleteUser(uid);
    await db.doc(`utenti/${uid}`).delete();
    return { uid };
  }
);

// ---------------------------------------------------------------------------
// apriSerata — prepara la serata di una data (contenitore degli ordini, con il
// contatore che riparte da 1). Va chiamata una volta prima di iniziare a
// prendere ordini; se la serata esiste già non la sovrascrive.
// ---------------------------------------------------------------------------

export const apriSerata = onCall(CHIAMABILE, async (request: CallableRequest<ApriSerataRichiesta>): Promise<ApriSerataRisposta> => {
  richiedeRuoloComande(request);
  const { data } = request.data ?? ({} as ApriSerataRichiesta);
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    throw new HttpsError('invalid-argument', 'Data non valida: attesa nel formato AAAA-MM-GG.');
  }

  const serataRef = db.collection('serate').doc(data);

  const giaEsistente = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(serataRef);
    if (snapshot.exists) return true;
    const serata: Serata = { id: data, data, aperta: true, contatoreOrdini: 0 };
    transaction.set(serataRef, serata);
    return false;
  });

  return { serataId: data, giaEsistente };
});

// ---------------------------------------------------------------------------
// Porzioni della serata — quante se ne possono vendere stasera e quando un
// piatto è finito. Il conteggio passa dal server: il numero venduto non deve
// poter essere ritoccato dal client.
// ---------------------------------------------------------------------------

export const impostaPorzioni = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ImpostaPorzioniRichiesta>): Promise<ProdottoRisposta> => {
    richiedeAmministratore(request);
    const { serataId, prodottoId, porzioniMassime } = request.data ?? ({} as ImpostaPorzioniRichiesta);
    validaTesto(serataId, 'Serata');
    validaTesto(prodottoId, 'Prodotto');
    if (porzioniMassime !== null && (!Number.isInteger(porzioniMassime) || porzioniMassime < 0)) {
      throw new HttpsError('invalid-argument', 'Le porzioni devono essere un numero intero, oppure vuoto per nessun limite.');
    }

    const ref = refDisponibilita(serataId, prodottoId);
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const venduti = (snapshot.data() as DisponibilitaProdotto | undefined)?.venduti ?? 0;
      const disponibilita: DisponibilitaProdotto = { prodottoId, porzioniMassime, venduti };
      transaction.set(ref, disponibilita);
      // Se il nuovo limite è già stato superato il piatto risulta finito,
      // altrimenti torna vendibile.
      const finito = porzioniMassime !== null && venduti >= porzioniMassime;
      transaction.update(db.doc(`prodotti/${prodottoId}`), { esauritoSerata: finito ? serataId : null });
    });

    return { prodottoId };
  }
);

export const segnaEsaurito = onCall(
  CHIAMABILE,
  async (request: CallableRequest<SegnaEsauritoRichiesta>): Promise<ProdottoRisposta> => {
    richiedeAmministratore(request);
    const { serataId, prodottoId, esaurito } = request.data ?? ({} as SegnaEsauritoRichiesta);
    validaTesto(serataId, 'Serata');
    validaTesto(prodottoId, 'Prodotto');
    await db.doc(`prodotti/${prodottoId}`).update({ esauritoSerata: esaurito === true ? serataId : null });
    return { prodottoId };
  }
);

// ---------------------------------------------------------------------------
// creaOrdineBozza — cliente da QR: crea un ordine in stato "bozza", non ancora
// pagato né inviato ai reparti. Non richiede autenticazione (flusso pubblico).
// ---------------------------------------------------------------------------

export const creaOrdineBozza = onCall(CHIAMABILE, async (request: CallableRequest<CreaOrdineBozzaRichiesta>): Promise<CreaOrdineRisposta> => {
  const { serataId, tavolo, coperti, items } = request.data ?? ({} as CreaOrdineBozzaRichiesta);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  const tavoloValidato = validaInteroPositivo(tavolo, 'Numero tavolo');
  const copertiValidati = validaInteroPositivo(coperti, 'Numero coperti');
  const itemsRichiesti = validaItemsRichiesti(items);

  return db.runTransaction(async (transaction) => {
    const serata = await leggiSerataAperta(transaction, serataId);
    // La bozza controlla la disponibilità ma non scala nulla: le porzioni si
    // scalano al pagamento.
    const { items: itemsOrdine, totale } = await costruisciItemsOrdine(transaction, serataId, itemsRichiesti);

    const numero = serata.contatoreOrdini + 1;
    transaction.update(serata.ref, { contatoreOrdini: numero });

    const ordineRef = db.collection(`serate/${serataId}/ordini`).doc();
    const ordine: Ordine = {
      id: ordineRef.id,
      serataId,
      numero,
      cassa: null,
      codice: null,
      codiceBarre: null,
      stato: 'bozza',
      tipo: 'qr',
      tavolo: tavoloValidato,
      coperti: copertiValidati,
      items: itemsOrdine,
      totale,
      createdAt: FieldValue.serverTimestamp() as unknown as Ordine['createdAt'],
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    transaction.set(ordineRef, ordine);

    return { ordineId: ordineRef.id, numero, totale };
  });
});

// ---------------------------------------------------------------------------
// creaOrdineCassa — la cassa conferma l'ordine battuto al banco, a cliente
// già pagato: l'ordine prende il numero di comanda, le porzioni si scalano e
// le comande partono verso i reparti, tutto nella stessa transazione. O
// succede tutto o non succede niente.
// ---------------------------------------------------------------------------

export const creaOrdineCassa = onCall(CHIAMABILE, async (request: CallableRequest<CreaOrdineCassaRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, items, tavolo, coperti, pagamento } = request.data ?? ({} as CreaOrdineCassaRichiesta);
  const metodo = validaPagamento(pagamento);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  const itemsRichiesti = validaItemsRichiesti(items);
  const tavoloValidato = validaInteroPositivo(tavolo, 'Numero tavolo');
  const copertiValidati = validaInteroPositivo(coperti, 'Numero coperti');
  const uid = request.auth!.uid;

  return db.runTransaction(async (transaction) => {
    // Tutte le letture prima di ogni scrittura: dentro una transazione
    // Firestore non si può più leggere dopo aver scritto.
    const serata = await leggiSerataAperta(transaction, serataId);
    const lettera = await leggiLetteraCassa(transaction, uid);
    const { items: itemsOrdine, totale, righe } = await costruisciItemsOrdine(transaction, serataId, itemsRichiesti);
    const componenti = await leggiComponenti(transaction);

    const { numero, codice, codiceBarre } = prossimoCodiceOrdine(transaction, serata, lettera);
    // Le porzioni si scalano adesso, che è anche il momento del pagamento: da
    // qui in poi sono vendute. Se l'ordine viene annullato tornano vendibili.
    scalaPorzioni(transaction, serataId, righe);

    const ordineRef = db.collection(`serate/${serataId}/ordini`).doc();
    const adesso = FieldValue.serverTimestamp() as unknown as Ordine['createdAt'];
    const ordine: Ordine = {
      id: ordineRef.id,
      serataId,
      numero,
      cassa: lettera,
      codice,
      codiceBarre,
      // La cassa chiama questa funzione quando il cliente ha già pagato:
      // l'ordine nasce pagato e parte subito verso i reparti. Non esiste un
      // momento in cui è scritto in archivio ma non ancora in lavorazione,
      // che è il momento in cui prima poteva restare appeso per sempre.
      stato: 'in_evasione',
      tipo: 'cassa',
      pagamento: metodo,
      tavolo: tavoloValidato,
      coperti: copertiValidati,
      items: itemsOrdine,
      totale,
      createdAt: adesso,
      confirmedAt: adesso,
      pagatoAt: adesso,
      completedAt: null,
      cancelledAt: null,
    };
    transaction.set(ordineRef, ordine);
    generaSottoOrdini(transaction, serataId, ordineRef.id, numero, codice, righe, componenti);

    return { ordineId: ordineRef.id, numero, codice, totale };
  });
});

// ---------------------------------------------------------------------------
// confermaOrdine — la cassa richiama una bozza dal QR (dal numero mostrato al
// cliente) e la conferma dopo aver incassato: prende il numero di comanda e
// parte subito verso i reparti, esattamente come un ordine battuto al banco.
// ---------------------------------------------------------------------------

export const confermaOrdine = onCall(CHIAMABILE, async (request: CallableRequest<ConfermaOrdineRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, numero, pagamento } = request.data ?? ({} as ConfermaOrdineRichiesta);
  const metodo = validaPagamento(pagamento);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  validaInteroPositivo(numero, 'Numero ordine');
  const uid = request.auth!.uid;

  return db.runTransaction(async (transaction) => {
    const serata = await leggiSerataAperta(transaction, serataId);
    const lettera = await leggiLetteraCassa(transaction, uid);
    // Solo tra gli ordini dal QR: anche la cassa A ha il suo ordine numero 7.
    const querySnapshot = await transaction.get(
      db.collection(`serate/${serataId}/ordini`).where('tipo', '==', 'qr').where('numero', '==', numero).limit(1)
    );
    if (querySnapshot.empty) {
      throw new HttpsError('not-found', `Nessun ordine con numero ${numero} in questa serata.`);
    }
    const ordineDoc = querySnapshot.docs[0];
    const ordine = ordineDoc.data() as Ordine;
    if (ordine.stato !== 'bozza') {
      throw new HttpsError(
        'failed-precondition',
        `L'ordine ${numero} non è (più) una bozza da confermare (stato attuale: ${ordine.stato}).`
      );
    }

    // Tra l'invio dal tavolo e la cassa qualcosa può essere finito: si
    // ricontrolla la disponibilità e solo ora si tengono da parte le porzioni.
    const { righe } = await costruisciItemsOrdine(
      transaction,
      serataId,
      ordine.items.map((item) => ({ prodottoId: item.prodottoId, quantita: item.quantita }))
    );
    // Ultima lettura prima delle scritture: la composizione dei piatti serve a
    // dividere l'ordine per settore.
    const componenti = await leggiComponenti(transaction);

    // Il numero di comanda lo dà la cassa che incassa, come per gli ordini
    // battuti al banco.
    const { codice, codiceBarre } = prossimoCodiceOrdine(transaction, serata, lettera);
    const adesso = FieldValue.serverTimestamp();
    transaction.update(ordineDoc.ref, {
      stato: 'in_evasione',
      cassa: lettera,
      codice,
      codiceBarre,
      pagamento: metodo,
      confirmedAt: adesso,
      pagatoAt: adesso,
    });
    scalaPorzioni(transaction, serataId, righe);
    generaSottoOrdini(transaction, serataId, ordineDoc.id, ordine.numero, codice, righe, componenti);

    return { ordineId: ordineDoc.id, numero, codice, totale: ordine.totale };
  });
});

// ---------------------------------------------------------------------------
// segnaSottoOrdinePronto — il settore (cucina/griglia/bar) segna un
// sotto-ordine come pronto per la consegna.
// ---------------------------------------------------------------------------

export const segnaSottoOrdinePronto = onCall(CHIAMABILE, async (request: CallableRequest<SegnaSottoOrdineProntoRichiesta>): Promise<SegnaSottoOrdineProntoRisposta> => {
  const permessi = richiedeRuoloComande(request, 'cucina', 'griglia', 'bar');
  const { serataId, sottoOrdineId } = request.data ?? ({} as SegnaSottoOrdineProntoRichiesta);
  if (typeof serataId !== 'string' || !serataId || typeof sottoOrdineId !== 'string' || !sottoOrdineId) {
    throw new HttpsError('invalid-argument', 'Sotto-ordine non valido.');
  }

  const sottoOrdineRef = db.doc(`serate/${serataId}/sottoOrdini/${sottoOrdineId}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(sottoOrdineRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Sotto-ordine inesistente.');
    }
    const sottoOrdine = snapshot.data() as SottoOrdine;
    if (!permessi.amministratore && !permessi.ruoli.includes(sottoOrdine.settore)) {
      throw new HttpsError('permission-denied', `Il sotto-ordine ${sottoOrdine.codice} appartiene a un altro settore.`);
    }
    if (sottoOrdine.stato !== 'in_preparazione') {
      throw new HttpsError(
        'failed-precondition',
        `Il sotto-ordine ${sottoOrdine.codice} non è in preparazione (stato attuale: ${sottoOrdine.stato}).`
      );
    }
    transaction.update(sottoOrdineRef, { stato: 'pronta', readyAt: FieldValue.serverTimestamp() });
  });

  return { sottoOrdineId };
});

// ---------------------------------------------------------------------------
// segnaCopiaCucinaStampata — la Distribuzione si prende la stampa della copia
// cucina di un ordine. Risponde "daStampare" a uno solo: così, anche con due
// computer accesi o ricaricando la pagina, il foglio esce una volta sola.
// ---------------------------------------------------------------------------

export const segnaCopiaCucinaStampata = onCall(
  CHIAMABILE,
  async (request: CallableRequest<SegnaCopiaCucinaStampataRichiesta>): Promise<SegnaCopiaCucinaStampataRisposta> => {
    richiedeRuoloComande(request, 'distribuzione');
    const { serataId, ordineId } = request.data ?? ({} as SegnaCopiaCucinaStampataRichiesta);
    if (typeof serataId !== 'string' || !serataId || typeof ordineId !== 'string' || !ordineId) {
      throw new HttpsError('invalid-argument', 'Ordine non valido.');
    }

    const ordineRef = db.doc(`serate/${serataId}/ordini/${ordineId}`);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ordineRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Ordine inesistente.');
      }
      const ordine = snapshot.data() as Ordine;
      // Si stampa solo quello che è stato pagato e non è ancora stato chiuso.
      if (ordine.stato !== 'in_evasione') {
        throw new HttpsError(
          'failed-precondition',
          `L'ordine ${ordine.codice ?? ordine.numero} non è in lavorazione (stato attuale: ${ordine.stato}).`
        );
      }
      if (ordine.copiaCucinaStampataAt) return { ordineId, daStampare: false };

      transaction.update(ordineRef, { copiaCucinaStampataAt: FieldValue.serverTimestamp() });
      return { ordineId, daStampare: true };
    });
  }
);

// ---------------------------------------------------------------------------
// chiudiOrdine — in Distribuzione si passa la copia cucina sotto il lettore:
// l'ordine viene consegnato per intero (tutte le sue comande) e i numeri dei
// pannelli scendono. Il codice a barre contiene comanda, data, ora e cassa.
// ---------------------------------------------------------------------------

export const chiudiOrdine = onCall(CHIAMABILE, async (request: CallableRequest<ChiudiOrdineRichiesta>): Promise<ChiudiOrdineRisposta> => {
  richiedeRuoloComande(request, 'distribuzione');
  const { serataId, codiceBarre } = request.data ?? ({} as ChiudiOrdineRichiesta);
  if (typeof serataId !== 'string' || !serataId || typeof codiceBarre !== 'string' || !codiceBarre) {
    throw new HttpsError('invalid-argument', 'Codice non valido.');
  }
  // Un lettore può aggiungere spazi o scrivere in minuscolo: si normalizza
  // prima di cercare, e un testo che non ha la forma di un nostro codice si
  // ferma qui senza nemmeno interrogare il database.
  const letto = leggiCodiceBarre(codiceBarre);
  if (!letto) {
    throw new HttpsError('invalid-argument', 'Codice non valido: non è il codice di una comanda.');
  }
  const testo = codiceBarre.trim().toUpperCase();

  return db.runTransaction(async (transaction) => {
    const trovatiSnapshot = await transaction.get(
      db.collection(`serate/${serataId}/ordini`).where('codiceBarre', '==', testo).limit(1)
    );
    if (trovatiSnapshot.empty) {
      throw new HttpsError(
        'not-found',
        `Il codice ${letto.codice} non è di questa serata: controlla la data sul foglio.`
      );
    }
    const ordineDoc = trovatiSnapshot.docs[0];
    const ordine = ordineDoc.data() as Ordine;

    if (ordine.stato === 'completata') {
      throw new HttpsError('failed-precondition', `L'ordine ${ordine.codice} è già stato consegnato.`);
    }
    if (ordine.stato === 'annullata') {
      throw new HttpsError('failed-precondition', `L'ordine ${ordine.codice} è stato annullato.`);
    }
    if (ordine.stato !== 'in_evasione') {
      throw new HttpsError('failed-precondition', `L'ordine ${ordine.codice} non risulta pagato: mandalo in cassa.`);
    }

    const comandeSnapshot = await transaction.get(
      db.collection(`serate/${serataId}/sottoOrdini`).where('ordineId', '==', ordineDoc.id)
    );

    const adesso = FieldValue.serverTimestamp();
    for (const comanda of comandeSnapshot.docs) {
      if ((comanda.data() as SottoOrdine).stato === 'consegnata') continue;
      transaction.update(comanda.ref, { stato: 'consegnata', deliveredAt: adesso });
    }
    transaction.update(ordineDoc.ref, { stato: 'completata', completedAt: adesso });

    return {
      ordineId: ordineDoc.id,
      codice: ordine.codice ?? letto.codice,
      tavolo: ordine.tavolo,
      coperti: ordine.coperti,
    };
  });
});

// ---------------------------------------------------------------------------
// consegnaSottoOrdine — chiusura di una singola comanda dal suo codice (es.
// C025). Resta per i casi in cui un settore consegna la sua parte da solo; il
// giro normale passa da chiudiOrdine, che chiude l'ordine intero.
// ---------------------------------------------------------------------------

export const consegnaSottoOrdine = onCall(CHIAMABILE, async (request: CallableRequest<ConsegnaSottoOrdineRichiesta>): Promise<ConsegnaSottoOrdineRisposta> => {
  richiedeRuoloComande(request, 'distribuzione');
  const { serataId, codice } = request.data ?? ({} as ConsegnaSottoOrdineRichiesta);
  if (typeof serataId !== 'string' || !serataId || typeof codice !== 'string' || !codice) {
    throw new HttpsError('invalid-argument', 'Codice non valido.');
  }

  return db.runTransaction(async (transaction) => {
    const sottoOrdiniRef = db.collection(`serate/${serataId}/sottoOrdini`);

    const trovatoSnapshot = await transaction.get(sottoOrdiniRef.where('codice', '==', codice).limit(1));
    if (trovatoSnapshot.empty) {
      throw new HttpsError('not-found', `Nessun sotto-ordine con codice ${codice} in questa serata.`);
    }
    const sottoOrdineDoc = trovatoSnapshot.docs[0];
    const sottoOrdine = sottoOrdineDoc.data() as SottoOrdine;
    if (sottoOrdine.stato !== 'pronta') {
      throw new HttpsError(
        'failed-precondition',
        `Il sotto-ordine ${codice} non è pronto per la consegna (stato attuale: ${sottoOrdine.stato}).`
      );
    }

    const fratelliSnapshot = await transaction.get(sottoOrdiniRef.where('ordineId', '==', sottoOrdine.ordineId));
    const tuttiConsegnatiDopoQuesto = fratelliSnapshot.docs.every(
      (doc) => doc.id === sottoOrdineDoc.id || (doc.data() as SottoOrdine).stato === 'consegnata'
    );

    transaction.update(sottoOrdineDoc.ref, { stato: 'consegnata', deliveredAt: FieldValue.serverTimestamp() });

    if (tuttiConsegnatiDopoQuesto) {
      const ordineRef = db.doc(`serate/${serataId}/ordini/${sottoOrdine.ordineId}`);
      transaction.update(ordineRef, { stato: 'completata', completedAt: FieldValue.serverTimestamp() });
    }

    return { ordineId: sottoOrdine.ordineId, ordineCompletato: tuttiConsegnatiDopoQuesto };
  });
});

// ---------------------------------------------------------------------------
// annullaOrdine — la cassa annulla un ordine confermato ma mai incassato;
// l'amministratore anche bozze e ordini già partiti (individuati a fine serata).
// ---------------------------------------------------------------------------

export const annullaOrdine = onCall(CHIAMABILE, async (request: CallableRequest<AnnullaOrdineRichiesta>): Promise<AnnullaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, ordineId } = request.data ?? ({} as AnnullaOrdineRichiesta);
  if (typeof serataId !== 'string' || !serataId || typeof ordineId !== 'string' || !ordineId) {
    throw new HttpsError('invalid-argument', 'Ordine non valido.');
  }

  const ordineRef = db.doc(`serate/${serataId}/ordini/${ordineId}`);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ordineRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', 'Ordine inesistente.');
    }
    const ordine = snapshot.data() as Ordine;
    if (ordine.stato === 'completata' || ordine.stato === 'annullata') {
      throw new HttpsError(
        'failed-precondition',
        `L'ordine ${ordine.codice ?? ordine.numero} non può essere annullato (stato attuale: ${ordine.stato}).`
      );
    }
    // La cassa annulla qualsiasi ordine non ancora consegnato, non solo i
    // propri. Prima poteva annullare solo quelli confermati e non incassati:
    // aveva senso finché c'era una finestra tra la conferma e il pagamento. Ora
    // che la conferma avviene a pagamento fatto, un errore si scopre a ordine
    // già partito, e mandare a cercare l'amministratore in mezzo alla sagra per
    // due patatine di troppo non sta in piedi. Un ordine già consegnato invece
    // non lo annulla più nessuno: il cibo è al tavolo.

    // Un ordine confermato in cassa aveva già scalato le porzioni: annullandolo tornano
    // vendibili. Una bozza non aveva scalato nulla.
    const daRestituire: { ref: DocumentReference; prodottoRef: DocumentReference; venduti: number }[] = [];
    if (ordine.stato !== 'bozza') {
      for (const item of ordine.items) {
        const ref = refDisponibilita(serataId, item.prodottoId);
        const snapshotDisponibilita = await transaction.get(ref);
        const disponibilita = snapshotDisponibilita.data() as DisponibilitaProdotto | undefined;
        if (!disponibilita) continue;
        daRestituire.push({
          ref,
          prodottoRef: db.doc(`prodotti/${item.prodottoId}`),
          venduti: Math.max(0, disponibilita.venduti - item.quantita),
        });
      }
    }

    transaction.update(ordineRef, { stato: 'annullata', cancelledAt: FieldValue.serverTimestamp() });
    for (const riga of daRestituire) {
      transaction.update(riga.ref, { venduti: riga.venduti });
      transaction.update(riga.prodottoRef, { esauritoSerata: null });
    }
  });

  return { ordineId };
});

// ---------------------------------------------------------------------------
// I banchi (BAR, BEVANDE)
//
// Un banco vende per conto suo: nessuna comanda ai reparti, nessuna porzione
// da scalare sul menù della sagra, nessun tavolo. Si batte, si incassa, esce
// lo scontrino. L'ordine nasce già incassato, perché al banco si paga subito.
//
// I prezzi si rileggono sempre dal menù del banco, mai da quello che manda il
// client: l'incasso della serata finisce in contabilità, e un totale che
// arriva dal browser non è un totale, è una proposta.
// ---------------------------------------------------------------------------

/** Chi può lavorare a questo banco: il suo ruolo, o l'amministratore. */
function richiedeBanco(request: CallableRequest, banco: Banco): { uid: string; nome: string } {
  richiedeRuoloComande(request, RUOLO_BANCO[banco]);
  const token = request.auth!.token as { name?: string; nome?: string };
  return { uid: request.auth!.uid, nome: token.name ?? token.nome ?? '' };
}

/** Contanti o POS. Chi non lo manda (un client vecchio, o il menù dal QR che
 * non incassa) si intende contanti: era l'unico modo di pagare prima. */
function validaPagamento(valore: unknown): MetodoPagamento {
  if (valore === undefined || valore === null) return 'contanti';
  if (typeof valore !== 'string' || !METODI_PAGAMENTO.includes(valore as MetodoPagamento)) {
    throw new HttpsError('invalid-argument', 'Metodo di pagamento non valido.');
  }
  return valore as MetodoPagamento;
}

function validaBanco(valore: unknown): Banco {
  if (typeof valore !== 'string' || !BANCHI.includes(valore as Banco)) {
    throw new HttpsError('invalid-argument', 'Banco non valido.');
  }
  return valore as Banco;
}

/** Le voci dell'ordine ricostruite dal menù del banco: nome e prezzo sono
 * quelli in archivio adesso, non quelli che aveva in mano il browser. */
async function costruisciItemsBanco(
  transaction: Transaction,
  banco: Banco,
  serataId: string,
  itemsRichiesti: ItemOrdineRichiesta[]
): Promise<{ items: ItemOrdineBanco[]; totale: number }> {
  const items: ItemOrdineBanco[] = [];
  let totale = 0;

  for (const richiesto of itemsRichiesti) {
    const ref = db.doc(`banchi/${banco}/prodotti/${richiesto.prodottoId}`);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Voce inesistente nel menù ${NOME_BANCO[banco]}: ${richiesto.prodottoId}.`);
    }
    const prodotto = snapshot.data() as ProdottoBanco;
    if (prodotto.esauritoSerata === serataId) {
      throw new HttpsError('failed-precondition', `Abbiamo appena terminato: ${prodotto.nome}.`);
    }
    items.push({
      prodottoId: richiesto.prodottoId,
      nome: prodotto.nome,
      prezzo: prodotto.prezzo,
      quantita: richiesto.quantita,
    });
    totale += prodotto.prezzo * richiesto.quantita;
  }

  return { items, totale: Math.round(totale * 100) / 100 };
}

/** Il nome di chi sta battendo, per l'archivio del banco. Si legge dal profilo
 * e non dal token: il token porta l'email tecnica, che non dice niente a
 * nessuno. */
async function leggiNomeUtente(transaction: Transaction, uid: string): Promise<string> {
  const snapshot = await transaction.get(db.doc(`utenti/${uid}`));
  const persona = snapshot.data() as Utente | undefined;
  return persona ? nomeCompleto(persona) : '';
}

export const creaOrdineBanco = onCall(
  CHIAMABILE,
  async (request: CallableRequest<CreaOrdineBancoRichiesta>): Promise<CreaOrdineBancoRisposta> => {
    const { serataId, banco, items, pagamento } = request.data ?? ({} as CreaOrdineBancoRichiesta);
    const metodo = validaPagamento(pagamento);
    const bancoValidato = validaBanco(banco);
    richiedeBanco(request, bancoValidato);
    if (typeof serataId !== 'string' || !serataId) {
      throw new HttpsError('invalid-argument', 'Serata non valida.');
    }
    const itemsRichiesti = validaItemsRichiesti(items);
    const uid = request.auth!.uid;

    return db.runTransaction(async (transaction) => {
      // Prima tutte le letture: dentro una transazione non si legge più dopo
      // aver scritto.
      const serata = await leggiSerataAperta(transaction, serataId);
      const { items: itemsOrdine, totale } = await costruisciItemsBanco(
        transaction,
        bancoValidato,
        serataId,
        itemsRichiesti
      );
      const nome = await leggiNomeUtente(transaction, uid);

      // Il contatore sta sulla serata e viene aggiornato dentro la
      // transazione: due baristi che battono nello stesso istante non possono
      // prendere lo stesso numero.
      const numero = (serata.contatoriBanco[bancoValidato] ?? 0) + 1;
      transaction.update(serata.ref, { [`contatoriBanco.${bancoValidato}`]: numero });

      const ordineRef = db.collection(`serate/${serataId}/ordiniBanco`).doc();
      const ordine: OrdineBanco = {
        id: ordineRef.id,
        serataId,
        banco: bancoValidato,
        numero,
        codice: formattaCodiceBanco(bancoValidato, numero),
        stato: 'incassato',
        pagamento: metodo,
        items: itemsOrdine,
        totale,
        operatoreUid: uid,
        operatoreNome: nome,
        createdAt: FieldValue.serverTimestamp() as unknown as OrdineBanco['createdAt'],
        cancelledAt: null,
      };
      transaction.set(ordineRef, ordine);

      return { ordineId: ordineRef.id, numero, codice: ordine.codice, totale };
    });
  }
);

/** Annulla un ordine già battuto: l'unico modo di correggere un errore, visto
 * che al banco l'ordine nasce già incassato. Resta in archivio barrato — via
 * dall'incasso ma non dalla storia della serata. */
export const annullaOrdineBanco = onCall(
  CHIAMABILE,
  async (request: CallableRequest<AnnullaOrdineBancoRichiesta>): Promise<AnnullaOrdineBancoRisposta> => {
    const { serataId, ordineId } = request.data ?? ({} as AnnullaOrdineBancoRichiesta);
    if (typeof serataId !== 'string' || !serataId || typeof ordineId !== 'string' || !ordineId) {
      throw new HttpsError('invalid-argument', 'Ordine non valido.');
    }
    const uid = request.auth?.uid;

    await db.runTransaction(async (transaction) => {
      const ordineRef = db.doc(`serate/${serataId}/ordiniBanco/${ordineId}`);
      const snapshot = await transaction.get(ordineRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Ordine inesistente.');
      }
      const ordine = snapshot.data() as OrdineBanco;
      // Il permesso si controlla sul banco dell'ordine, non su quello che
      // dichiara il client: chi sta al BAR non annulla gli incassi di BEVANDE.
      richiedeBanco(request, ordine.banco);
      if (ordine.stato === 'annullato') {
        throw new HttpsError('failed-precondition', 'Questo ordine è già annullato.');
      }
      const nome = uid ? await leggiNomeUtente(transaction, uid) : '';

      transaction.update(ordineRef, {
        stato: 'annullato',
        cancelledAt: FieldValue.serverTimestamp(),
        annullatoDaNome: nome,
      });
    });

    return { ordineId };
  }
);

// ---------------------------------------------------------------------------
// segnaComandaStampata — il banco che riceve le comande dalla cassa (BEVANDE)
// si prende la stampa di una di esse. Stesso meccanismo della copia cucina in
// Distribuzione: risponde "daStampare" a uno solo, così con due schermi accesi
// o ricaricando la pagina il foglio esce una volta sola.
// ---------------------------------------------------------------------------

export const segnaComandaStampata = onCall(
  CHIAMABILE,
  async (request: CallableRequest<SegnaComandaStampataRichiesta>): Promise<SegnaComandaStampataRisposta> => {
    richiedeRuoloComande(request, RUOLO_BANCO[BANCO_CON_COMANDE]);
    const { serataId, sottoOrdineId } = request.data ?? ({} as SegnaComandaStampataRichiesta);
    if (typeof serataId !== 'string' || !serataId || typeof sottoOrdineId !== 'string' || !sottoOrdineId) {
      throw new HttpsError('invalid-argument', 'Comanda non valida.');
    }

    const ref = db.doc(`serate/${serataId}/sottoOrdini/${sottoOrdineId}`);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Comanda inesistente.');
      }
      const sottoOrdine = snapshot.data() as SottoOrdine;
      if (sottoOrdine.settore !== SETTORE_DEL_BANCO) {
        throw new HttpsError('failed-precondition', 'Questa comanda non è del banco delle bevande.');
      }
      if (sottoOrdine.stampataAt) {
        return { sottoOrdineId, daStampare: false };
      }
      transaction.update(ref, { stampataAt: FieldValue.serverTimestamp() });
      return { sottoOrdineId, daStampare: true };
    });
  }
);

// ---------------------------------------------------------------------------
// Le segnalazioni dai bagni
//
// Il cliente inquadra il QR appeso in bagno, tocca cosa non va e manda. Non ha
// fatto l'accesso — è un cliente — quindi questa funzione si può chiamare
// senza autenticazione, come il menù dal QR del tavolo. Per la stessa ragione
// non accetta testo libero: quello che arriva da fuori finisce sugli schermi
// di tutti, e l'unica cosa che non si può scrivere è quella che non esiste.
// ---------------------------------------------------------------------------

export const segnalaBagno = onCall(
  CHIAMABILE,
  async (request: CallableRequest<SegnalaBagnoRichiesta>): Promise<SegnalaBagnoRisposta> => {
    const { serataId, bagno, tipo } = request.data ?? ({} as SegnalaBagnoRichiesta);
    if (typeof serataId !== 'string' || !serataId) {
      throw new HttpsError('invalid-argument', 'Serata non valida.');
    }
    if (typeof bagno !== 'string' || !BAGNI.includes(bagno as Bagno)) {
      throw new HttpsError('invalid-argument', 'Bagno non valido.');
    }
    const testo = TESTO_SEGNALAZIONE[tipo as TipoSegnalazione];
    if (!testo) {
      throw new HttpsError('invalid-argument', 'Segnalazione non valida.');
    }

    const collezione = db.collection(`serate/${serataId}/segnalazioni`);
    const da = new Date(Date.now() - MINUTI_SEGNALAZIONE_DOPPIA * 60 * 1000);

    return db.runTransaction(async (transaction) => {
      // La stessa cosa nello stesso bagno, segnalata da poco e non ancora
      // presa in carico, non ne crea una seconda: dieci persone che trovano il
      // bagno senza sapone sono un avviso solo, non dieci.
      const recenti = await transaction.get(collezione.where('createdAt', '>=', Timestamp.fromDate(da)));
      const uguale = recenti.docs.find((doc) => {
        const altra = doc.data() as SegnalazioneBagno;
        return altra.bagno === bagno && altra.tipo === tipo && !altra.presaInCaricoAt;
      });
      if (uguale) {
        return { segnalazioneId: uguale.id, giaSegnalata: true };
      }

      const ref = collezione.doc();
      const segnalazione: SegnalazioneBagno = {
        id: ref.id,
        serataId,
        bagno: bagno as Bagno,
        tipo: tipo as TipoSegnalazione,
        testo,
        createdAt: FieldValue.serverTimestamp() as unknown as SegnalazioneBagno['createdAt'],
        presaInCaricoAt: null,
        presaInCaricoDa: null,
      };
      transaction.set(ref, segnalazione);
      return { segnalazioneId: ref.id, giaSegnalata: false };
    });
  }
);

/** "Ci penso io": l'avviso sparisce da tutti gli schermi, così non partono in
 * due per lo stesso bagno. Può premerlo chiunque stia lavorando, qualunque sia
 * il suo ruolo: chi ha un attimo ci va, e non serve essere di turno da nessuna
 * parte per portare un rotolo di carta. */
export const prendiSegnalazione = onCall(
  CHIAMABILE,
  async (request: CallableRequest<PrendiSegnalazioneRichiesta>): Promise<PrendiSegnalazioneRisposta> => {
    richiedeRuoloComande(request, ...RUOLI_COMANDE);
    const { serataId, segnalazioneId } = request.data ?? ({} as PrendiSegnalazioneRichiesta);
    if (typeof serataId !== 'string' || !serataId || typeof segnalazioneId !== 'string' || !segnalazioneId) {
      throw new HttpsError('invalid-argument', 'Segnalazione non valida.');
    }
    const uid = request.auth!.uid;

    await db.runTransaction(async (transaction) => {
      const ref = db.doc(`serate/${serataId}/segnalazioni/${segnalazioneId}`);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Segnalazione inesistente.');
      }
      if ((snapshot.data() as SegnalazioneBagno).presaInCaricoAt) {
        // Ci ha già pensato qualcun altro: non è un errore, è la cosa che
        // doveva succedere. Si risponde bene e basta.
        return;
      }
      const nome = await leggiNomeUtente(transaction, uid);
      transaction.update(ref, {
        presaInCaricoAt: FieldValue.serverTimestamp(),
        presaInCaricoDa: nome,
      });
    });

    return { segnalazioneId };
  }
);

// ---------------------------------------------------------------------------
// Archivio dell'edizione (app "Utenti") — tutto riservato all'amministratore.
//
// Salvare, azzerare e ricaricare passano dal server per due ragioni: gli
// ordini dal browser non si possono scrivere né cancellare (lo vietano le
// regole, apposta), e un'operazione che cancella un anno intero deve avere un
// solo posto dove si decide se si può fare.
// ---------------------------------------------------------------------------

/** Abbastanza tempo e memoria per un'edizione intera: qualche migliaio di
 * documenti, più le foto degli scontrini. */
const CHIAMABILE_ARCHIVIO: CallableOptions = { ...CHIAMABILE, timeoutSeconds: 540, memory: '1GiB' };

/** Quanto resta valido il salvataggio: dopo, per azzerare va rifatto. Così
 * non si azzera un'edizione salvata ieri e poi cambiata stamattina. */
const VALIDITA_SALVATAGGIO_MS = 2 * 60 * 60 * 1000;

function validaAnno(valore: unknown): string {
  if (typeof valore !== 'string' || !/^\d{4}$/.test(valore)) {
    throw new HttpsError('invalid-argument', 'Anno dell’edizione non valido.');
  }
  return valore;
}

/** Le date diventano { __timestamp: [s, ns] }: nel file JSON non esiste un
 * tipo "data", e così al ricaricamento tornano date vere e non testi. */
function codifica(valore: unknown): unknown {
  if (valore instanceof Timestamp) return { __timestamp: [valore.seconds, valore.nanoseconds] };
  if (Array.isArray(valore)) return valore.map(codifica);
  if (valore && typeof valore === 'object') {
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, codifica(v)]));
  }
  return valore;
}

function decodifica(valore: unknown): unknown {
  if (Array.isArray(valore)) return valore.map(decodifica);
  if (valore && typeof valore === 'object') {
    const ts = (valore as { __timestamp?: unknown }).__timestamp;
    if (Array.isArray(ts) && ts.length === 2 && Object.keys(valore).length === 1) {
      return new Timestamp(Number(ts[0]), Number(ts[1]));
    }
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, decodifica(v)]));
  }
  return valore;
}

/** A pezzi, per non lanciare mille richieste insieme. */
async function aPezzi<T, R>(elementi: T[], quanti: number, fai: (elemento: T) => Promise<R>): Promise<R[]> {
  const risultati: R[] = [];
  for (let i = 0; i < elementi.length; i += quanti) {
    risultati.push(...(await Promise.all(elementi.slice(i, i + quanti).map(fai))));
  }
  return risultati;
}

/** Un documento e tutto quello che ci sta sotto, a qualunque profondità.
 * Si scende anche nei documenti "fantasma" (che non esistono ma hanno
 * raccolte sotto di sé), altrimenti quello che c'è sotto andrebbe perso. */
async function raccogli(ref: DocumentReference, fuori: DocumentoArchiviato[]): Promise<void> {
  const [snapshot, raccolte] = await Promise.all([ref.get(), ref.listCollections()]);
  if (snapshot.exists) fuori.push({ percorso: ref.path, dati: codifica(snapshot.data()) as Record<string, unknown> });
  for (const raccolta of raccolte) {
    const documenti = await raccolta.listDocuments();
    await aPezzi(documenti, 50, (documento) => raccogli(documento, fuori));
  }
}

/** I documenti che contengono un'edizione: le sue serate e il suo documento. */
async function radiciDellEdizione(anno: string): Promise<DocumentReference[]> {
  const serate = (await db.collection('serate').listDocuments()).filter((ref) => ref.id.startsWith(`${anno}-`));
  return [...serate, db.doc(`edizioni/${anno}`)];
}

async function movimentiDellEdizione(anno: string): Promise<DocumentoArchiviato[]> {
  const movimenti: DocumentoArchiviato[] = [];
  for (const radice of await radiciDellEdizione(anno)) await raccogli(radice, movimenti);
  // Le foto degli scontrini delle spese e delle entrate di quest'anno.
  const immagini = new Set(
    movimenti
      .filter((d) => /^edizioni\/[^/]+\/(uscite|entrate)\//.test(d.percorso))
      .map((d) => d.dati.immagineId)
      .filter((id): id is string => typeof id === 'string' && id !== '')
  );
  for (const id of immagini) {
    const snapshot = await db.doc(`immagini/${id}`).get();
    if (snapshot.exists) movimenti.push({ percorso: snapshot.ref.path, dati: codifica(snapshot.data()) as Record<string, unknown> });
  }
  return movimenti;
}

/** Il menù, le persone e i biglietti com'erano: si salvano per leggerli, non si
 * azzerano e non si ricaricano. Le immagini dei biglietti restano fuori: sono
 * grandi e sono le stesse da un anno all'altro. */
async function riferimentoAttuale(): Promise<DocumentoArchiviato[]> {
  const riferimento: DocumentoArchiviato[] = [];
  for (const nome of ['categorie', 'prodotti', 'componenti', 'biglietti', 'utenti']) {
    const snapshot = await db.collection(nome).get();
    for (const documento of snapshot.docs) {
      riferimento.push({ percorso: documento.ref.path, dati: codifica(documento.data()) as Record<string, unknown> });
    }
  }
  for (const banco of await db.collection('banchi').listDocuments()) await raccogli(banco, riferimento);
  return riferimento;
}

export const riepilogoEdizioni = onCall(
  CHIAMABILE_ARCHIVIO,
  async (request: CallableRequest<void>): Promise<RiepilogoEdizioniRisposta> => {
    richiedeAmministratore(request);
    const anni = new Set<string>();
    for (const ref of await db.collection('serate').listDocuments()) anni.add(ref.id.slice(0, 4));
    for (const ref of await db.collection('edizioni').listDocuments()) anni.add(ref.id);

    const edizioni: RiepilogoEdizione[] = [];
    for (const anno of [...anni].filter((a) => /^\d{4}$/.test(a)).sort().reverse()) {
      const serate = (await db.collection('serate').listDocuments()).filter((ref) => ref.id.startsWith(`${anno}-`));
      const conta = async (percorso: string) => (await db.collection(percorso).count().get()).data().count;
      const perSerata = await aPezzi(serate, 20, async (ref) => ({
        esiste: (await ref.get()).exists,
        ordini: await conta(`${ref.path}/ordini`),
        ordiniBanco: await conta(`${ref.path}/ordiniBanco`),
      }));
      const somma = (campo: 'ordini' | 'ordiniBanco') => perSerata.reduce((totale, s) => totale + s[campo], 0);
      const riepilogo: RiepilogoEdizione = {
        anno,
        serate: perSerata.filter((s) => s.esiste).length,
        ordini: somma('ordini'),
        ordiniBanco: somma('ordiniBanco'),
        uscite: await conta(`edizioni/${anno}/uscite`),
        entrate: await conta(`edizioni/${anno}/entrate`),
        giornate: await conta(`edizioni/${anno}/giornate`),
        documenti: 0,
      };
      riepilogo.documenti =
        riepilogo.serate + riepilogo.ordini + riepilogo.ordiniBanco + riepilogo.uscite + riepilogo.entrate + riepilogo.giornate;
      // Un anno rimasto con solo documenti vuoti non si mostra.
      if (riepilogo.documenti > 0) edizioni.push(riepilogo);
    }
    return { edizioni };
  }
);

export const esportaEdizione = onCall(
  CHIAMABILE_ARCHIVIO,
  async (request: CallableRequest<AnnoRichiesta>): Promise<ArchivioEdizione> => {
    richiedeAmministratore(request);
    const anno = validaAnno(request.data?.anno);
    const archivio: ArchivioEdizione = {
      app: 'sagra-mazzocco',
      versione: VERSIONE_ARCHIVIO,
      anno,
      creatoAt: new Date().toISOString(),
      movimenti: await movimentiDellEdizione(anno),
      riferimento: await riferimentoAttuale(),
    };
    // Si annota che l'edizione è stata salvata: azzerarla senza averla
    // salvata poco prima non si può.
    await db.doc('config/archivio').set({ [anno]: FieldValue.serverTimestamp() }, { merge: true });
    return archivio;
  }
);

export const azzeraEdizione = onCall(
  CHIAMABILE_ARCHIVIO,
  async (request: CallableRequest<AzzeraEdizioneRichiesta>): Promise<OperazioneArchivioRisposta> => {
    richiedeAmministratore(request);
    const anno = validaAnno(request.data?.anno);
    if (request.data?.conferma !== `AZZERA ${anno}`) {
      throw new HttpsError('invalid-argument', `Per confermare scrivi esattamente: AZZERA ${anno}`);
    }
    const salvato = (await db.doc('config/archivio').get()).get(anno) as Timestamp | undefined;
    if (!salvato || Date.now() - salvato.toMillis() > VALIDITA_SALVATAGGIO_MS) {
      throw new HttpsError(
        'failed-precondition',
        `Prima di azzerare scarica l'archivio del ${anno}: l'ultimo salvataggio manca o è di più di due ore fa.`
      );
    }

    const movimenti = await movimentiDellEdizione(anno);
    for (const radice of await radiciDellEdizione(anno)) await db.recursiveDelete(radice);
    for (const immagine of movimenti.filter((d) => d.percorso.startsWith('immagini/'))) {
      await db.doc(immagine.percorso).delete();
    }
    // Il salvataggio vale per un azzeramento solo.
    await db.doc('config/archivio').set({ [anno]: FieldValue.delete() }, { merge: true });
    return { anno, documenti: movimenti.length };
  }
);

export const ricaricaEdizione = onCall(
  CHIAMABILE_ARCHIVIO,
  async (request: CallableRequest<RicaricaEdizioneRichiesta>): Promise<OperazioneArchivioRisposta> => {
    richiedeAmministratore(request);
    const archivio = request.data?.archivio;
    if (!archivio || archivio.app !== 'sagra-mazzocco' || !Array.isArray(archivio.movimenti)) {
      throw new HttpsError('invalid-argument', 'Questo file non è un archivio della Sagra di Mazzocco.');
    }
    if (archivio.versione !== VERSIONE_ARCHIVIO) {
      throw new HttpsError('invalid-argument', `Archivio di una versione che questa app non conosce (${archivio.versione}).`);
    }
    const anno = validaAnno(archivio.anno);
    for (const documento of archivio.movimenti) {
      const percorso = documento?.percorso;
      // Un percorso valido ha un numero pari di pezzi (raccolta/documento) ed
      // è dentro l'edizione: un file manomesso non scrive altrove.
      if (
        typeof percorso !== 'string' ||
        percorso.split('/').length % 2 !== 0 ||
        percorso.split('/').some((pezzo) => !pezzo) ||
        !percorsoDellEdizione(percorso, anno) ||
        !documento.dati ||
        typeof documento.dati !== 'object'
      ) {
        throw new HttpsError('invalid-argument', `L'archivio contiene un documento non valido: ${String(percorso)}.`);
      }
    }

    // Mai due edizioni mescolate: si ricarica solo dove non c'è niente.
    const giaPresenti = await movimentiDellEdizione(anno);
    if (giaPresenti.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Nel ${anno} ci sono già dei dati (${giaPresenti.length} documenti). Si ricarica solo in un'edizione vuota: prima salvala e azzerala.`
      );
    }

    const scrittore = db.bulkWriter();
    for (const documento of archivio.movimenti) {
      void scrittore.set(db.doc(documento.percorso), decodifica(documento.dati) as Record<string, unknown>);
    }
    await scrittore.close();
    return { anno, documenti: archivio.movimenti.length };
  }
);
