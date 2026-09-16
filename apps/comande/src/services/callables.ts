import { httpsCallable } from 'firebase/functions';
import type {
  AnnullaOrdineRichiesta,
  AnnullaOrdineRisposta,
  ConfermaOrdineRichiesta,
  CreaOrdineCassaRichiesta,
  CreaOrdineRisposta,
  ImpostaPorzioniRichiesta,
  SegnaEsauritoRichiesta,
  ProdottoRisposta,
  SegnaSottoOrdineProntoRichiesta,
  SegnaSottoOrdineProntoRisposta,
} from '@sagra-mazzocco/shared';
import { functions } from './firebase';

export const creaOrdineCassa = httpsCallable<CreaOrdineCassaRichiesta, CreaOrdineRisposta>(
  functions,
  'creaOrdineCassa'
);

export const confermaOrdine = httpsCallable<ConfermaOrdineRichiesta, CreaOrdineRisposta>(
  functions,
  'confermaOrdine'
);

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

/** Le Cloud Functions rispondono con errori HttpsError: firebase/functions
 * espone il messaggio leggibile in `error.message`, il resto (stack, codice
 * interno) non serve mostrarlo al cassiere. */
export function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Errore imprevisto.';
}
