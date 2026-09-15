import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import { auth } from '../services/firebase';
import { messaggioErrore } from '../services/callables';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="login">
      <div className="login-intro">
        <span className="occhiello">Sagra di Mazzocco</span>
        <h1>Cassa</h1>
        <p>Accedi con l'account del personale per prendere le comande.</p>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {errore && <p className="errore">{errore}</p>}
        <button type="submit" className="bottone-principale" disabled={inCorso}>
          {inCorso ? 'Accesso in corso…' : 'Entra'}
        </button>
      </form>
    </div>
  );
}
