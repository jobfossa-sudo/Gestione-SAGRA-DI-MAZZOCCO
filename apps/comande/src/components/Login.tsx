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
    <form className="login" onSubmit={handleSubmit}>
      <h1>Cassa — accesso</h1>
      <label>
        Email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      {errore && <p className="errore">{errore}</p>}
      <button type="submit" disabled={inCorso}>
        {inCorso ? 'Accesso in corso…' : 'Entra'}
      </button>
    </form>
  );
}
