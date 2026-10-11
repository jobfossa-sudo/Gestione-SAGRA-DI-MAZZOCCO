import { httpsCallable } from 'firebase/functions';
import type {
  AggiornaAnagraficaRichiesta,
  CreaUtenteRichiesta,
  EliminaUtenteRichiesta,
  ImpostaAttivoRichiesta,
  ImpostaLetteraCassaRichiesta,
  ImpostaRuoloRichiesta,
  ReimpostaPasswordRichiesta,
  UtenteRisposta,
} from '@sagra-mazzocco/shared';
import { functions } from './firebase';

export const creaUtente = httpsCallable<CreaUtenteRichiesta, UtenteRisposta>(functions, 'creaUtente');
export const impostaRuolo = httpsCallable<ImpostaRuoloRichiesta, UtenteRisposta>(functions, 'impostaRuolo');
export const aggiornaAnagrafica = httpsCallable<AggiornaAnagraficaRichiesta, UtenteRisposta>(functions, 'aggiornaAnagrafica');
export const reimpostaPassword = httpsCallable<ReimpostaPasswordRichiesta, UtenteRisposta>(functions, 'reimpostaPassword');
export const impostaAttivo = httpsCallable<ImpostaAttivoRichiesta, UtenteRisposta>(functions, 'impostaAttivo');
export const impostaLetteraCassa = httpsCallable<ImpostaLetteraCassaRichiesta, UtenteRisposta>(functions, 'impostaLetteraCassa');
export const eliminaUtente = httpsCallable<EliminaUtenteRichiesta, UtenteRisposta>(functions, 'eliminaUtente');

export function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Errore imprevisto.';
}
