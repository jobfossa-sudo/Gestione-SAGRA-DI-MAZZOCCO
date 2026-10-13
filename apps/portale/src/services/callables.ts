import { httpsCallable } from 'firebase/functions';
import type { CreaEdizioneRichiesta, EdizioneRisposta, ModificaEdizioneRichiesta } from '@sagra-mazzocco/shared';
import { functions } from './firebase';

/** L'edizione la scrive solo il server: è lui a controllare che ce ne sia
 * una sola alla volta e che le serate siano date vere dello stesso anno. */
export const creaEdizione = httpsCallable<CreaEdizioneRichiesta, EdizioneRisposta>(functions, 'creaEdizione');

export const modificaEdizione = httpsCallable<ModificaEdizioneRichiesta, EdizioneRisposta>(
  functions,
  'modificaEdizione'
);

/** Il messaggio del server è già scritto per chi legge; il codice HTTP in
 * coda ("… [400]") è roba da programmatori e si toglie. */
export function messaggioErrore(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/\s*\[\d{3}\]\s*$/, '');
  return 'Errore imprevisto.';
}
