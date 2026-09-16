import { useState } from 'react';
import { NOME_RUOLO_COMANDE, RUOLI_COMANDE, type RuoloComande } from '@sagra-mazzocco/shared';
import { SceltaLetteraCassa } from './SceltaLetteraCassa';
import { creaUtente, messaggioErrore } from '../services/callables';

export function NuovoUtente() {
  const [nome, setNome] = useState('');
  const [nomeUtente, setNomeUtente] = useState('');
  const [password, setPassword] = useState('');
  const [amministratore, setAmministratore] = useState(false);
  const [comande, setComande] = useState<RuoloComande[]>([]);
  const [letteraCassa, setLetteraCassa] = useState<string | null>(null);
  // La lettera serve solo a chi batte ordini in cassa.
  const puoIncassare = amministratore || comande.includes('cassa');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [successo, setSuccesso] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setSuccesso(null);
    setInCorso(true);
    try {
      await creaUtente({
        nomeUtente,
        nome,
        password,
        amministratore,
        accessi: comande.length > 0 ? { comande } : {},
        letteraCassa: puoIncassare ? letteraCassa : null,
      });
      setSuccesso(`Creato l'account "${nomeUtente}". Comunica a ${nome} il nome utente e la password.`);
      setNome('');
      setNomeUtente('');
      setPassword('');
      setAmministratore(false);
      setComande([]);
      setLetteraCassa(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form className="nuovo-utente" onSubmit={handleSubmit}>
      <h2>Nuovo utente</h2>
      <div className="campi">
        <label>
          Nome e cognome
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>
        <label>
          Nome utente
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
      </div>

      <div className="scelta-ruoli">
        <span className="titolo-ruoli">Ruoli in Comande</span>
        <div className="caselle-ruoli">
          {RUOLI_COMANDE.map((ruolo) => (
            <label key={ruolo}>
              <input
                type="checkbox"
                checked={comande.includes(ruolo)}
                disabled={amministratore}
                onChange={(e) =>
                  setComande((prec) => (e.target.checked ? [...prec, ruolo] : prec.filter((r) => r !== ruolo)))
                }
              />
              {NOME_RUOLO_COMANDE[ruolo]}
            </label>
          ))}
        </div>
      </div>

      {puoIncassare && (
        <label className="riga-lettera">
          Lettera della cassa
          <SceltaLetteraCassa valore={letteraCassa} onChange={setLetteraCassa} />
          <span className="spiegazione-lettera">I suoi ordini si numerano con questa lettera: A0001, A0002…</span>
        </label>
      )}

      <label className="riga-flag">
        <input type="checkbox" checked={amministratore} onChange={(e) => setAmministratore(e.target.checked)} />
        Amministratore (accede a tutto, in tutte le app, e gestisce gli utenti)
      </label>

      {errore && <p className="errore">{errore}</p>}
      {successo && <p className="successo">{successo}</p>}

      <button type="submit" className="bottone-principale" disabled={inCorso}>
        {inCorso ? 'Creazione in corso…' : 'Crea utente'}
      </button>
    </form>
  );
}
