import { httpsCallable } from 'firebase/functions';
import type {
  AggiornaAnagraficaRichiesta,
  AnnoRichiesta,
  ArchivioEdizione,
  AzzeraEdizioneRichiesta,
  OperazioneArchivioRisposta,
  RicaricaEdizioneRichiesta,
  RiepilogoEdizioniRisposta,
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

// L'archivio lavora su un'edizione intera: il tempo d'attesa normale (70
// secondi) non basta, si aspetta quanto il server.
const LUNGA = { timeout: 540_000 };
export const riepilogoEdizioni = httpsCallable<void, RiepilogoEdizioniRisposta>(functions, 'riepilogoEdizioni', LUNGA);
export const esportaEdizione = httpsCallable<AnnoRichiesta, ArchivioEdizione>(functions, 'esportaEdizione', LUNGA);
export const azzeraEdizione = httpsCallable<AzzeraEdizioneRichiesta, OperazioneArchivioRisposta>(functions, 'azzeraEdizione', LUNGA);
export const ricaricaEdizione = httpsCallable<RicaricaEdizioneRichiesta, OperazioneArchivioRisposta>(functions, 'ricaricaEdizione', LUNGA);

export function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Errore imprevisto.';
}
