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
} from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { onCall, HttpsError, CallableOptions, CallableRequest } from 'firebase-functions/v2/https';
import {
  Accessi,
  Permessi,
  RuoloComande,
  Utente,
  REGOLA_NOME_UTENTE,
  emailDaNomeUtente,
  InizializzaSistemaRichiesta,
  InizializzaSistemaRisposta,
  CreaUtenteRichiesta,
  AggiornaPermessiRichiesta,
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
  InviaOrdineRichiesta,
  InviaOrdineRisposta,
  SegnaCopiaCucinaStampataRichiesta,
  SegnaCopiaCucinaStampataRisposta,
  ChiudiOrdineRichiesta,
  ChiudiOrdineRisposta,
  leggiCodiceBarre,
  ImpostaLetteraCassaRichiesta,
  REGOLA_LETTERA_CASSA,
  formattaCodiceOrdine,
  componiCodiceBarre,
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

function validaAccessi(valore: unknown): Accessi {
  const accessi = (valore ?? {}) as Accessi;
  if (accessi.comande === undefined) return {};
  if (!Array.isArray(accessi.comande)) {
    throw new HttpsError('invalid-argument', 'I ruoli in Comande devono essere un elenco.');
  }
  for (const ruolo of accessi.comande) {
    if (!RUOLI_COMANDE.includes(ruolo)) {
      throw new HttpsError('invalid-argument', `Ruolo non valido per Comande: ${ruolo}.`);
    }
  }
  const ruoli = RUOLI_COMANDE.filter((ruolo) => accessi.comande!.includes(ruolo));
  return ruoli.length > 0 ? { comande: ruoli } : {};
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

async function creaAccount(dati: {
  nomeUtente: string;
  nome: string;
  password: string;
  amministratore: boolean;
  accessi: Accessi;
  letteraCassa?: string | null;
}): Promise<string> {
  const nomeUtente = dati.nomeUtente.trim().toLowerCase();
  if (!REGOLA_NOME_UTENTE.test(nomeUtente)) {
    throw new HttpsError(
      'invalid-argument',
      'Nome utente non valido: da 3 a 30 caratteri tra lettere minuscole, numeri, punto, trattino e trattino basso.'
    );
  }
  if (dati.password.length < 8) {
    throw new HttpsError('invalid-argument', 'La password deve avere almeno 8 caratteri.');
  }

  let uid: string;
  try {
    const account = await getAuth().createUser({
      email: emailDaNomeUtente(nomeUtente),
      password: dati.password,
      displayName: dati.nome,
    });
    uid = account.uid;
  } catch (err) {
    if ((err as { code?: string }).code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', `Il nome utente "${nomeUtente}" è già in uso.`);
    }
    throw err;
  }

  const permessi: Permessi = { ...dati.accessi, ...(dati.amministratore ? { amministratore: true } : {}) };
  await getAuth().setCustomUserClaims(uid, permessi);
  const utente: Utente = {
    uid,
    nomeUtente,
    nome: dati.nome,
    amministratore: dati.amministratore,
    accessi: dati.accessi,
    letteraCassa: dati.letteraCassa ?? null,
    attivo: true,
    createdAt: FieldValue.serverTimestamp() as unknown as Utente['createdAt'],
  };
  await db.doc(`utenti/${uid}`).set(utente);
  return uid;
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
): Promise<{ ref: DocumentReference; contatoreOrdini: number; contatoriCassa: Record<string, number> }> {
  const ref = db.collection('serate').doc(serataId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Serata inesistente.');
  }
  const serata = snapshot.data() as Serata;
  if (!serata.aperta) {
    throw new HttpsError('failed-precondition', 'La serata è chiusa.');
  }
  return { ref, contatoreOrdini: serata.contatoreOrdini, contatoriCassa: serata.contatoriCassa ?? {} };
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
      const uid = await creaAccount({
        nomeUtente: validaTesto(nomeUtente, 'Nome utente'),
        nome: validaTesto(nome, 'Nome'),
        password: typeof password === 'string' ? password : '',
        amministratore: true,
        accessi: {},
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
  const uid = await creaAccount({
    nomeUtente: validaTesto(dati.nomeUtente, 'Nome utente'),
    nome: validaTesto(dati.nome, 'Nome'),
    password: typeof dati.password === 'string' ? dati.password : '',
    amministratore: dati.amministratore === true,
    accessi: validaAccessi(dati.accessi),
    letteraCassa: validaLetteraCassa(dati.letteraCassa),
  });
  return { uid };
});

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

export const aggiornaPermessi = onCall(
  CHIAMABILE,
  async (request: CallableRequest<AggiornaPermessiRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid, amministratore } = request.data ?? ({} as AggiornaPermessiRichiesta);
    validaTesto(uid, 'Utente');
    vietaAutoBlocco(uidRichiedente, uid, 'cambiare i permessi');

    const accessi = validaAccessi(request.data?.accessi);
    const permessi: Permessi = { ...accessi, ...(amministratore === true ? { amministratore: true } : {}) };
    await getAuth().setCustomUserClaims(uid, permessi);
    await db.doc(`utenti/${uid}`).update({ amministratore: amministratore === true, accessi });
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
    if (typeof password !== 'string' || password.length < 8) {
      throw new HttpsError('invalid-argument', 'La password deve avere almeno 8 caratteri.');
    }
    await getAuth().updateUser(uid, { password });
    await getAuth().revokeRefreshTokens(uid);
    return { uid };
  }
);

export const impostaAttivo = onCall(
  CHIAMABILE,
  async (request: CallableRequest<ImpostaAttivoRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid, attivo } = request.data ?? ({} as ImpostaAttivoRichiesta);
    validaTesto(uid, 'Utente');
    vietaAutoBlocco(uidRichiedente, uid, 'cambiare l’attivazione');

    await getAuth().updateUser(uid, { disabled: attivo !== true });
    await db.doc(`utenti/${uid}`).update({ attivo: attivo === true });
    await getAuth().revokeRefreshTokens(uid);
    return { uid };
  }
);

/** Cancellazione definitiva: l'account sparisce da Authentication e il suo
 * profilo da Firestore. Gli ordini già registrati non ne contengono
 * riferimenti, quindi lo storico resta integro. */
export const eliminaUtente = onCall(
  CHIAMABILE,
  async (request: CallableRequest<EliminaUtenteRichiesta>): Promise<UtenteRisposta> => {
    const uidRichiedente = richiedeAmministratore(request);
    const { uid } = request.data ?? ({} as EliminaUtenteRichiesta);
    validaTesto(uid, 'Utente');
    vietaAutoBlocco(uidRichiedente, uid, 'eliminare');

    await getAuth().deleteUser(uid);
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
// creaOrdineCassa — la cassa conferma l'ordine battuto al banco: riceve il
// numero di comanda, si stampa il resoconto per il cliente e le porzioni si
// tengono da parte. L'ordine resta "da_pagare": verso i reparti parte solo con
// inviaOrdine, dopo l'incasso.
// ---------------------------------------------------------------------------

export const creaOrdineCassa = onCall(CHIAMABILE, async (request: CallableRequest<CreaOrdineCassaRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, items, tavolo, coperti } = request.data ?? ({} as CreaOrdineCassaRichiesta);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  const itemsRichiesti = validaItemsRichiesti(items);
  const tavoloValidato = validaInteroPositivo(tavolo, 'Numero tavolo');
  const copertiValidati = validaInteroPositivo(coperti, 'Numero coperti');
  const uid = request.auth!.uid;

  return db.runTransaction(async (transaction) => {
    const serata = await leggiSerataAperta(transaction, serataId);
    const lettera = await leggiLetteraCassa(transaction, uid);
    const { items: itemsOrdine, totale, righe } = await costruisciItemsOrdine(transaction, serataId, itemsRichiesti);

    const { numero, codice, codiceBarre } = prossimoCodiceOrdine(transaction, serata, lettera);
    // Le porzioni si scalano già alla conferma: il cliente ha in mano il
    // resoconto stampato, un'altra cassa non deve potergli vendere l'ultima
    // porzione mentre paga. Se l'ordine viene annullato tornano vendibili.
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
      stato: 'da_pagare',
      tipo: 'cassa',
      tavolo: tavoloValidato,
      coperti: copertiValidati,
      items: itemsOrdine,
      totale,
      createdAt: adesso,
      confirmedAt: adesso,
      pagatoAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    transaction.set(ordineRef, ordine);

    return { ordineId: ordineRef.id, numero, codice, totale };
  });
});

// ---------------------------------------------------------------------------
// confermaOrdine — la cassa richiama una bozza dal QR (dal numero mostrato al
// cliente) e la conferma: da qui segue lo stesso giro di un ordine battuto al
// banco (numero di comanda, resoconto, pagamento, invio).
// ---------------------------------------------------------------------------

export const confermaOrdine = onCall(CHIAMABILE, async (request: CallableRequest<ConfermaOrdineRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, numero } = request.data ?? ({} as ConfermaOrdineRichiesta);
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

    // Il numero di comanda lo dà la cassa che incassa, come per gli ordini
    // battuti al banco.
    const { codice, codiceBarre } = prossimoCodiceOrdine(transaction, serata, lettera);
    transaction.update(ordineDoc.ref, {
      stato: 'da_pagare',
      cassa: lettera,
      codice,
      codiceBarre,
      confirmedAt: FieldValue.serverTimestamp(),
      pagatoAt: null,
    });
    scalaPorzioni(transaction, serataId, righe);

    return { ordineId: ordineDoc.id, numero, codice, totale: ordine.totale };
  });
});

// ---------------------------------------------------------------------------
// inviaOrdine — il cliente ha pagato: l'ordine parte verso i reparti, diviso
// in una comanda per settore.
// ---------------------------------------------------------------------------

export const inviaOrdine = onCall(CHIAMABILE, async (request: CallableRequest<InviaOrdineRichiesta>): Promise<InviaOrdineRisposta> => {
  richiedeRuoloComande(request, 'cassa');
  const { serataId, ordineId } = request.data ?? ({} as InviaOrdineRichiesta);
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
    if (ordine.stato !== 'da_pagare' || !ordine.codice) {
      const motivo =
        ordine.stato === 'in_evasione' || ordine.stato === 'completata'
          ? 'è già stato inviato'
          : ordine.stato === 'annullata'
            ? 'è stato annullato'
            : 'non è ancora stato confermato in cassa';
      throw new HttpsError('failed-precondition', `L'ordine ${ordine.codice ?? ordine.numero} ${motivo}.`);
    }

    // La composizione si legge adesso: conta quella in vigore quando l'ordine
    // parte davvero verso i settori. Se nel frattempo un piatto è stato tolto
    // dal menù, lo si prepara comunque com'era quando è stato venduto.
    const righe: { prodotto: Prodotto; quantita: number }[] = [];
    for (const item of ordine.items) {
      const prodottoSnapshot = await transaction.get(db.doc(`prodotti/${item.prodottoId}`));
      const prodotto = (prodottoSnapshot.data() as Prodotto | undefined) ?? ({
        id: item.prodottoId,
        nome: item.nome,
        settore: item.settore,
      } as Prodotto);
      righe.push({ prodotto, quantita: item.quantita });
    }
    const componenti = await leggiComponenti(transaction);

    transaction.update(ordineRef, { stato: 'in_evasione', pagatoAt: FieldValue.serverTimestamp() });
    generaSottoOrdini(transaction, serataId, ordineId, ordine.numero, ordine.codice, righe, componenti);

    return { ordineId, codice: ordine.codice };
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
  const permessi = richiedeRuoloComande(request, 'cassa');
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
    // La cassa annulla solo quello che non ha ancora incassato (il cliente se
    // ne va senza pagare); un ordine già partito lo annulla l'amministratore.
    if (!permessi.amministratore && ordine.stato !== 'da_pagare') {
      throw new HttpsError('permission-denied', 'La cassa può annullare solo gli ordini non ancora incassati.');
    }

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
