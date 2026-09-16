import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { emailDaNomeUtente } from '@sagra-mazzocco/shared';
import { auth } from '../services/firebase';

function messaggioAccesso(err: unknown): string {
  const codice = (err as { code?: string }).code;
  if (codice === 'auth/invalid-credential' || codice === 'auth/wrong-password' || codice === 'auth/user-not-found') {
    return 'Nome utente o password errati.';
  }
  if (codice === 'auth/user-disabled') return 'Questo account è stato disattivato.';
  if (codice === 'auth/too-many-requests') return 'Troppi tentativi: riprova tra qualche minuto.';
  if (codice === 'auth/network-request-failed') return 'Connessione assente: controlla la rete.';
  return 'Accesso non riuscito.';
}

export function Login() {
  const [nomeUtente, setNomeUtente] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      await signInWithEmailAndPassword(auth, emailDaNomeUtente(nomeUtente), password);
    } catch (err) {
      setErrore(messaggioAccesso(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="login">
      <div className="login-intro">
        <span className="occhiello">Sagra di Mazzocco</span>
        <h1>Utenti</h1>
        <p>Area riservata all'amministratore.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Nome utente
          <input
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            value={nomeUtente}
            onChange={(e) => setNomeUtente(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button type="submit" className="bottone-principale" disabled={inCorso}>
          {inCorso ? 'Accesso in corso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}
