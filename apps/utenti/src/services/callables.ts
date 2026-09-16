import { httpsCallable } from 'firebase/functions';
import type {
  AggiornaPermessiRichiesta,
  CreaUtenteRichiesta,
  EliminaUtenteRichiesta,
  ImpostaAttivoRichiesta,
  ReimpostaPasswordRichiesta,
  UtenteRisposta,
} from '@sagra-mazzocco/shared';
import { functions } from './firebase';

export const creaUtente = httpsCallable<CreaUtenteRichiesta, UtenteRisposta>(functions, 'creaUtente');
export const aggiornaPermessi = httpsCallable<AggiornaPermessiRichiesta, UtenteRisposta>(functions, 'aggiornaPermessi');
export const reimpostaPassword = httpsCallable<ReimpostaPasswordRichiesta, UtenteRisposta>(functions, 'reimpostaPassword');
export const impostaAttivo = httpsCallable<ImpostaAttivoRichiesta, UtenteRisposta>(functions, 'impostaAttivo');
export const eliminaUtente = httpsCallable<EliminaUtenteRichiesta, UtenteRisposta>(functions, 'eliminaUtente');

export function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Errore imprevisto.';
}
