import { useState } from 'react';
import { NOME_RUOLO, RUOLI, type Ruolo } from '@sagra-mazzocco/shared';
import { SceltaLetteraCassa } from './SceltaLetteraCassa';
import { creaUtente, messaggioErrore } from '../services/callables';

/** La lettera serve solo a chi batte ordini in cassa. */
export function puoIncassare(ruolo: Ruolo): boolean {
  return ruolo === 'cassa' || ruolo === 'amministratore';
}

/** Tendina dei ruoli, la stessa nel modulo e in tabella. */
export function SceltaRuolo({
  valore,
  onChange,
  disabled,
  ariaLabel,
}: {
  valore: Ruolo;
  onChange: (ruolo: Ruolo) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      className="scelta-ruolo"
      value={valore}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as Ruolo)}
    >
      {RUOLI.map((ruolo) => (
        <option key={ruolo} value={ruolo}>
          {NOME_RUOLO[ruolo]}
        </option>
      ))}
    </select>
  );
}

export function NuovoUtente() {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  // Si parte da "nessun accesso": la maggior parte dei volontari non entra
  // mai nelle app, e chi aggiunge in fila trenta nomi non deve cambiarlo ogni volta.
  const [ruolo, setRuolo] = useState<Ruolo>('nessuno');
  const [nomeUtente, setNomeUtente] = useState('');
  const [password, setPassword] = useState('');
  const [letteraCassa, setLetteraCassa] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);
  const conAccesso = ruolo !== 'nessuno';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setSuccesso(null);
    setInCorso(true);
    try {
      await creaUtente({
        nome,
        cognome,
        ruolo,
        ...(conAccesso ? { nomeUtente, password, letteraCassa: puoIncassare(ruolo) ? letteraCassa : null } : {}),
      });
      setSuccesso(
        conAccesso
          ? `Aggiunto ${nome} ${cognome}. Comunicagli il nome utente "${nomeUtente}" e la password.`
          : `Aggiunto ${nome} ${cognome}.`
      );
      setNome('');
      setCognome('');
      setNomeUtente('');
      setPassword('');
      setLetteraCassa(null);
      // Il ruolo resta: si aggiungono spesso più persone dello stesso tipo di fila.
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form className="nuovo-utente" onSubmit={handleSubmit}>
      <h2>Nuova persona</h2>
      <div className="campi">
        <label>
          Nome
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          Cognome
          <input type="text" value={cognome} onChange={(e) => setCognome(e.target.value)} required />
        </label>
        <label>
          Ruolo
          <SceltaRuolo valore={ruolo} onChange={setRuolo} />
        </label>
      </div>

      {conAccesso ? (
        <div className="campi">
          <label>
            N. utente
            <input
              type="text"
              value={nomeUtente}
              onChange={(e) => setNomeUtente(e.target.value.toLowerCase())}
              placeholder="mario.rossi"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
            />
          </label>
          <label>
            Password
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="almeno 8 caratteri"
              required
            />
          </label>
          {puoIncassare(ruolo) && (
            <label>
              Lettera della cassa
              <SceltaLetteraCassa valore={letteraCassa} onChange={setLetteraCassa} />
            </label>
          )}
        </div>
      ) : (
        <p className="spiegazione">
          Senza accesso la persona non entra nelle app: è in elenco per segnarle le presenze. Potrai darle un ruolo in
          qualsiasi momento.
        </p>
      )}

      {errore && <p className="errore">{errore}</p>}
      {successo && <p className="successo">{successo}</p>}

      <button type="submit" className="bottone-principale" disabled={inCorso}>
        {inCorso ? 'Aggiunta in corso…' : 'Aggiungi'}
      </button>
    </form>
  );
}
