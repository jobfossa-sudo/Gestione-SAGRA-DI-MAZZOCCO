// Cloud Functions per la logica di business condivisa del sistema Sagra di
// Mazzocco: numerazione ordini, generazione sotto-ordini per reparto,
// transizioni di stato. Tutte le scritture su ordini/sottoOrdini passano di
// qui (i client non possono scrivere direttamente, vedi firestore.rules).

import { initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
  Transaction,
  DocumentReference,
} from 'firebase-admin/firestore';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
  Ordine,
  SottoOrdine,
  Prodotto,
  Serata,
  ItemOrdine,
  ItemSottoOrdine,
  Reparto,
  PREFISSO_REPARTO,
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
} from '@sagra-mazzocco/shared';

initializeApp();
const db = getFirestore();

// ---------------------------------------------------------------------------
// Helper condivisi
// ---------------------------------------------------------------------------

function richiedeAutenticazione(request: CallableRequest): void {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Operazione riservata al personale autenticato.');
  }
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

/** Legge i prodotti richiesti da Firestore (dentro la transazione) e costruisce
 * gli item dell'ordine usando SEMPRE nome/prezzo/reparto presi dal database:
 * i valori eventualmente inviati dal client per questi campi vengono ignorati,
 * altrimenti chiunque potrebbe alterare i prezzi di un ordine pubblico da QR. */
async function costruisciItemsOrdine(
  transaction: Transaction,
  itemsRichiesti: ItemOrdineRichiesta[]
): Promise<{ items: ItemOrdine[]; totale: number }> {
  const items: ItemOrdine[] = [];
  let totale = 0;

  for (const richiesto of itemsRichiesti) {
    const prodottoRef = db.collection('prodotti').doc(richiesto.prodottoId);
    const snapshot = await transaction.get(prodottoRef);
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Prodotto inesistente: ${richiesto.prodottoId}.`);
    }
    const prodotto = snapshot.data() as Prodotto;
    if (!prodotto.disponibile) {
      throw new HttpsError('failed-precondition', `Prodotto non disponibile: ${prodotto.nome}.`);
    }
    items.push({
      prodottoId: richiesto.prodottoId,
      nome: prodotto.nome,
      reparto: prodotto.reparto,
      prezzo: prodotto.prezzo,
      quantita: richiesto.quantita,
    });
    totale += prodotto.prezzo * richiesto.quantita;
  }

  return { items, totale };
}

/** Legge la serata (dentro la transazione) e verifica che sia aperta. Non
 * scrive nulla: l'incremento del contatore va fatto DOPO tutte le altre
 * letture della stessa transazione (Firestore vuole tutte le get prima di
 * qualsiasi set/update). */
async function leggiSerataAperta(
  transaction: Transaction,
  serataId: string
): Promise<{ ref: DocumentReference; contatoreOrdini: number }> {
  const ref = db.collection('serate').doc(serataId);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Serata inesistente.');
  }
  const serata = snapshot.data() as Serata;
  if (!serata.aperta) {
    throw new HttpsError('failed-precondition', 'La serata è chiusa.');
  }
  return { ref, contatoreOrdini: serata.contatoreOrdini };
}

function formattaCodice(reparto: Reparto, numero: number): string {
  return `${PREFISSO_REPARTO[reparto]}${numero.toString().padStart(3, '0')}`;
}

/** Raggruppa gli item dell'ordine per reparto e crea, dentro la transazione,
 * un sotto-ordine per ciascun reparto coinvolto. */
function generaSottoOrdini(
  transaction: Transaction,
  serataId: string,
  ordineId: string,
  numero: number,
  items: ItemOrdine[]
): void {
  const perReparto = new Map<Reparto, ItemSottoOrdine[]>();
  for (const item of items) {
    const lista = perReparto.get(item.reparto) ?? [];
    lista.push({ prodottoId: item.prodottoId, nome: item.nome, quantita: item.quantita });
    perReparto.set(item.reparto, lista);
  }

  for (const [reparto, itemsReparto] of perReparto) {
    const sottoOrdineRef = db.collection(`serate/${serataId}/sottoOrdini`).doc();
    const sottoOrdine: SottoOrdine = {
      id: sottoOrdineRef.id,
      codice: formattaCodice(reparto, numero),
      ordineId,
      serataId,
      numeroOrdine: numero,
      reparto,
      stato: 'in_preparazione',
      items: itemsReparto,
      createdAt: FieldValue.serverTimestamp() as unknown as SottoOrdine['createdAt'],
      readyAt: null,
      deliveredAt: null,
    };
    transaction.set(sottoOrdineRef, sottoOrdine);
  }
}

// ---------------------------------------------------------------------------
// creaOrdineBozza — cliente da QR: crea un ordine in stato "bozza", non ancora
// pagato né inviato ai reparti. Non richiede autenticazione (flusso pubblico).
// ---------------------------------------------------------------------------

export const creaOrdineBozza = onCall(async (request: CallableRequest<CreaOrdineBozzaRichiesta>): Promise<CreaOrdineRisposta> => {
  const { serataId, tavolo, coperti, items } = request.data ?? ({} as CreaOrdineBozzaRichiesta);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  const tavoloValidato = validaInteroPositivo(tavolo, 'Numero tavolo');
  const copertiValidati = validaInteroPositivo(coperti, 'Numero coperti');
  const itemsRichiesti = validaItemsRichiesti(items);

  return db.runTransaction(async (transaction) => {
    const serata = await leggiSerataAperta(transaction, serataId);
    const { items: itemsOrdine, totale } = await costruisciItemsOrdine(transaction, itemsRichiesti);

    const numero = serata.contatoreOrdini + 1;
    transaction.update(serata.ref, { contatoreOrdini: numero });

    const ordineRef = db.collection(`serate/${serataId}/ordini`).doc();
    const ordine: Ordine = {
      id: ordineRef.id,
      serataId,
      numero,
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
// creaOrdineCassa — cassiere: ordine diretto, già pagato. Genera subito i
// sotto-ordini per reparto (l'ordine parte immediatamente in cucina/bar).
// ---------------------------------------------------------------------------

export const creaOrdineCassa = onCall(async (request: CallableRequest<CreaOrdineCassaRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeAutenticazione(request);
  const { serataId, items, tavolo, coperti } = request.data ?? ({} as CreaOrdineCassaRichiesta);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  const itemsRichiesti = validaItemsRichiesti(items);
  const tavoloValidato = tavolo != null ? validaInteroPositivo(tavolo, 'Numero tavolo') : null;
  const copertiValidati = coperti != null ? validaInteroPositivo(coperti, 'Numero coperti') : null;

  return db.runTransaction(async (transaction) => {
    const serata = await leggiSerataAperta(transaction, serataId);
    const { items: itemsOrdine, totale } = await costruisciItemsOrdine(transaction, itemsRichiesti);

    const numero = serata.contatoreOrdini + 1;
    transaction.update(serata.ref, { contatoreOrdini: numero });

    const ordineRef = db.collection(`serate/${serataId}/ordini`).doc();
    const adesso = FieldValue.serverTimestamp() as unknown as Ordine['createdAt'];
    const ordine: Ordine = {
      id: ordineRef.id,
      serataId,
      numero,
      stato: 'in_evasione',
      tipo: 'cassa',
      tavolo: tavoloValidato,
      coperti: copertiValidati,
      items: itemsOrdine,
      totale,
      createdAt: adesso,
      confirmedAt: adesso,
      completedAt: null,
      cancelledAt: null,
    };
    transaction.set(ordineRef, ordine);
    generaSottoOrdini(transaction, serataId, ordineRef.id, numero, itemsOrdine);

    return { ordineId: ordineRef.id, numero, totale };
  });
});

// ---------------------------------------------------------------------------
// confermaOrdine — cassiere conferma una bozza (trovata dal numero d'ordine
// mostrato al cliente dopo l'invio da QR) e genera i sotto-ordini.
// ---------------------------------------------------------------------------

export const confermaOrdine = onCall(async (request: CallableRequest<ConfermaOrdineRichiesta>): Promise<CreaOrdineRisposta> => {
  richiedeAutenticazione(request);
  const { serataId, numero } = request.data ?? ({} as ConfermaOrdineRichiesta);
  if (typeof serataId !== 'string' || !serataId) {
    throw new HttpsError('invalid-argument', 'Serata non valida.');
  }
  validaInteroPositivo(numero, 'Numero ordine');

  return db.runTransaction(async (transaction) => {
    const querySnapshot = await transaction.get(
      db.collection(`serate/${serataId}/ordini`).where('numero', '==', numero).limit(1)
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

    transaction.update(ordineDoc.ref, {
      stato: 'in_evasione',
      confirmedAt: FieldValue.serverTimestamp(),
    });
    generaSottoOrdini(transaction, serataId, ordineDoc.id, numero, ordine.items);

    return { ordineId: ordineDoc.id, numero, totale: ordine.totale };
  });
});

// ---------------------------------------------------------------------------
// segnaSottoOrdinePronto — il reparto (cucina/bevande) segna un sotto-ordine
// come pronto per la consegna.
// ---------------------------------------------------------------------------

export const segnaSottoOrdinePronto = onCall(async (request: CallableRequest<SegnaSottoOrdineProntoRichiesta>): Promise<SegnaSottoOrdineProntoRisposta> => {
  richiedeAutenticazione(request);
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
// consegnaSottoOrdine — l'inserviente scansiona il barcode (il "codice", es.
// C025) per chiudere un sotto-ordine. Se è l'ultimo sotto-ordine dell'ordine,
// l'ordine passa automaticamente a "completata".
// ---------------------------------------------------------------------------

export const consegnaSottoOrdine = onCall(async (request: CallableRequest<ConsegnaSottoOrdineRichiesta>): Promise<ConsegnaSottoOrdineRisposta> => {
  richiedeAutenticazione(request);
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
// annullaOrdine — il cassiere annulla una bozza mai pagata o un ordine pagato
// mai completato (individuati a fine serata).
// ---------------------------------------------------------------------------

export const annullaOrdine = onCall(async (request: CallableRequest<AnnullaOrdineRichiesta>): Promise<AnnullaOrdineRisposta> => {
  richiedeAutenticazione(request);
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
        `L'ordine ${ordine.numero} non può essere annullato (stato attuale: ${ordine.stato}).`
      );
    }
    transaction.update(ordineRef, { stato: 'annullata', cancelledAt: FieldValue.serverTimestamp() });
  });

  return { ordineId };
});
