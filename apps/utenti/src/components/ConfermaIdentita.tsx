import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { useState } from 'react';
import type { Permessi } from '@sagra-mazzocco/shared';
import { auth } from '../services/firebase';

function messaggio(err: unknown): string {
  const codice = (err as { code?: string }).code ?? '';
  if (codice === 'auth/invalid-credential' || codice === 'auth/wrong-password') return 'Password errata.';
  if (codice === 'auth/too-many-requests') return 'Troppi tentativi sbagliati: aspetta qualche minuto e riprova.';
  if (codice === 'auth/network-request-failed') return 'Connessione assente: controlla la rete e riprova.';
  return (err as Error).message ?? 'Errore imprevisto.';
}

/** La finestra che chiede di nuovo la password prima delle operazioni che
 * toccano un'edizione intera (salvare, azzerare, ricaricare).
 *
 * Non basta essere già dentro l'app: un computer lasciato acceso è un
 * computer da cui chiunque potrebbe azzerare un anno. Riscrivere la password
 * aggiorna anche il momento dell'accesso nel gettone dell'account, ed è quello
 * che il server controlla davvero. */
export function ConfermaIdentita({
  azione,
  onConfermato,
  onAnnulla,
}: {
  /** Cosa si sta per fare, detto per intero: "azzerare l'edizione 2026". */
  azione: string;
  onConfermato: () => void;
  onAnnulla: () => void;
}) {
  const utente = auth.currentUser;
  const email = utente?.email ?? '';
  const nomeUtente = email.split('@')[0];
  const [password, setPassword] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function conferma(e: React.FormEvent) {
    e.preventDefault();
    if (!utente) return;
    setErrore(null);
    setInCorso(true);
    try {
      await reauthenticateWithCredential(utente, EmailAuthProvider.credential(email, password));
      // Il gettone nuovo, con il momento dell'accesso aggiornato e i permessi di adesso.
      const permessi = (await utente.getIdTokenResult(true)).claims as Permessi;
      if (permessi.amministratore !== true) {
        setErrore('Questo account non è più amministratore.');
        return;
      }
      onConfermato();
    } catch (err) {
      setErrore(messaggio(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="velo" role="dialog" aria-modal="true" aria-labelledby="titolo-conferma">
      <form className="finestra-conferma" onSubmit={conferma}>
        <h2 id="titolo-conferma">Conferma la tua identità</h2>
        <p className="spiegazione">
          Per {azione} serve la password dell'amministratore.
        </p>
        <label>
          Nome utente
          <input type="text" value={nomeUtente} readOnly />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </label>
        {errore && <p className="errore">{errore}</p>}
        <div className="tasti-conferma">
          <button type="button" onClick={onAnnulla} disabled={inCorso}>
            Annulla
          </button>
          <button type="submit" className="bottone-principale" disabled={inCorso || !password}>
            {inCorso ? 'Controllo…' : 'Conferma'}
          </button>
        </div>
      </form>
    </div>
  );
}
