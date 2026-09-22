import { httpsCallable } from 'firebase/functions';
import type {
  AnnullaOrdineRichiesta,
  AnnullaOrdineRisposta,
  ChiudiOrdineRichiesta,
  ChiudiOrdineRisposta,
  SegnaCopiaCucinaStampataRichiesta,
  SegnaCopiaCucinaStampataRisposta,
  ConfermaOrdineRichiesta,
  CreaOrdineBozzaRichiesta,
  CreaOrdineCassaRichiesta,
  CreaOrdineRisposta,
  ImpostaPorzioniRichiesta,
  SegnaEsauritoRichiesta,
  ProdottoRisposta,
  SegnaSottoOrdineProntoRichiesta,
  SegnaSottoOrdineProntoRisposta,
} from '@sagra-mazzocco/shared';
import { functions } from './firebase';

/** L'ordine che il cliente invia dal menù QR: resta una bozza finché non passa
 * in cassa. È l'unica funzione che si può chiamare senza aver fatto l'accesso. */
export const creaOrdineBozza = httpsCallable<CreaOrdineBozzaRichiesta, CreaOrdineRisposta>(
  functions,
  'creaOrdineBozza'
);

export const creaOrdineCassa = httpsCallable<CreaOrdineCassaRichiesta, CreaOrdineRisposta>(
  functions,
  'creaOrdineCassa'
);

export const confermaOrdine = httpsCallable<ConfermaOrdineRichiesta, CreaOrdineRisposta>(
  functions,
  'confermaOrdine'
);

/** Il cliente ha pagato: l'ordine parte verso i reparti. */

export const annullaOrdine = httpsCallable<AnnullaOrdineRichiesta, AnnullaOrdineRisposta>(
  functions,
  'annullaOrdine'
);

export const impostaPorzioni = httpsCallable<ImpostaPorzioniRichiesta, ProdottoRisposta>(functions, 'impostaPorzioni');

export const segnaEsaurito = httpsCallable<SegnaEsauritoRichiesta, ProdottoRisposta>(functions, 'segnaEsaurito');

export const segnaSottoOrdinePronto = httpsCallable<SegnaSottoOrdineProntoRichiesta, SegnaSottoOrdineProntoRisposta>(
  functions,
  'segnaSottoOrdinePronto'
);

/** La Distribuzione si prende la stampa della copia cucina di un ordine:
 * risponde "daStampare" a uno solo, così il foglio esce una volta sola. */
export const segnaCopiaCucinaStampata = httpsCallable<
  SegnaCopiaCucinaStampataRichiesta,
  SegnaCopiaCucinaStampataRisposta
>(functions, 'segnaCopiaCucinaStampata');

/** La lettura del codice a barre: chiude l'ordine intero. */
export const chiudiOrdine = httpsCallable<ChiudiOrdineRichiesta, ChiudiOrdineRisposta>(functions, 'chiudiOrdine');

/** Le Cloud Functions rispondono con errori HttpsError: firebase/functions
 * espone il messaggio leggibile in `error.message`, il resto (stack, codice
 * interno) non serve mostrarlo al cassiere. */
/** Quando la richiesta non arriva nemmeno al server (rete assente o server non
 * raggiungibile) il codice è uno di questi, e il messaggio originale è in
 * inglese e da programmatori. */
const ERRORI_DI_RETE = ['functions/internal', 'functions/unavailable', 'functions/deadline-exceeded'];

export function messaggioErrore(err: unknown): string {
  const codice = (err as { code?: string } | null)?.code;
  if (typeof codice === 'string' && ERRORI_DI_RETE.includes(codice)) {
    return navigator.onLine
      ? 'Il server non risponde: l’ordine non è partito. Controlla il collegamento e riprova.'
      : 'Senza collegamento l’ordine non può partire. Riprova quando la rete torna.';
  }
  // Il messaggio può arrivare con il codice HTTP in coda ("… [400]"): è roba
  // da programmatori, chi sta in cassa non deve leggerla.
  if (err instanceof Error) return err.message.replace(/\s*\[\d{3}\]\s*$/, '');
  return 'Errore imprevisto.';
}
