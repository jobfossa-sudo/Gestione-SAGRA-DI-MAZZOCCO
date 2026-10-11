import { useState } from 'react';
import { NOME_RUOLO, nomeCompleto, ruoloDi, type Ruolo, type Utente } from '@sagra-mazzocco/shared';
import { useUtenti } from '../hooks';
import { puoIncassare, SceltaRuolo } from './NuovoUtente';
import { SceltaLetteraCassa } from './SceltaLetteraCassa';
import {
  aggiornaAnagrafica,
  eliminaUtente,
  impostaAttivo,
  impostaLetteraCassa,
  impostaRuolo,
  messaggioErrore,
  reimpostaPassword,
} from '../services/callables';

const COLONNE = 6;

/** Quello che la riga sta chiedendo, quando serve più di un clic. */
type Richiesta =
  | { tipo: 'nome'; nome: string; cognome: string }
  | { tipo: 'password'; password: string }
  /** Chi era "solo presenze" riceve un ruolo: l'account va creato. */
  | { tipo: 'accesso'; ruolo: Ruolo; nomeUtente: string; password: string };

function RigaUtente({ utente, sonoIo }: { utente: Utente; sonoIo: boolean }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [richiesta, setRichiesta] = useState<Richiesta | null>(null);
  const ruolo = ruoloDi(utente);
  const chi = nomeCompleto(utente);

  async function esegui(operazione: () => Promise<unknown>) {
    setErrore(null);
    setInCorso(true);
    try {
      await operazione();
      setRichiesta(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  function cambiaRuolo(nuovo: Ruolo) {
    if (nuovo === ruolo) return;
    if (!utente.nomeUtente && nuovo !== 'nessuno') {
      setRichiesta({ tipo: 'accesso', ruolo: nuovo, nomeUtente: '', password: '' });
      return;
    }
    if (nuovo === 'nessuno') {
      const conferma = window.confirm(
        `${chi} non potrà più entrare nelle app e il suo nome utente "${utente.nomeUtente}" verrà cancellato. Resta in elenco con le sue presenze. Continuare?`
      );
      if (!conferma) return;
    }
    void esegui(() => impostaRuolo({ uid: utente.uid, ruolo: nuovo }));
  }

  async function elimina() {
    const conferma = window.confirm(
      `Sei sicuro di voler eliminare definitivamente ${chi}${utente.nomeUtente ? ` (${utente.nomeUtente})` : ''}?`
    );
    if (!conferma) return;
    await esegui(() => eliminaUtente({ uid: utente.uid }));
  }

  function conferma(e: React.FormEvent) {
    e.preventDefault();
    if (!richiesta) return;
    if (richiesta.tipo === 'nome') {
      void esegui(() => aggiornaAnagrafica({ uid: utente.uid, nome: richiesta.nome, cognome: richiesta.cognome }));
    } else if (richiesta.tipo === 'password') {
      void esegui(() => reimpostaPassword({ uid: utente.uid, password: richiesta.password }));
    } else {
      void esegui(() =>
        impostaRuolo({
          uid: utente.uid,
          ruolo: richiesta.ruolo,
          nomeUtente: richiesta.nomeUtente,
          password: richiesta.password,
        })
      );
    }
  }

  return (
    <>
      <tr className={utente.attivo ? undefined : 'disattivato'}>
        <td>
          <span className="nome">{utente.cognome ?? ''}</span>
        </td>
        <td>
          <span className="nome">{utente.nome}</span>
          {sonoIo && <span className="etichetta-io">tu</span>}
        </td>
        <td>
          {utente.nomeUtente ? (
            <span className="nome-utente">{utente.nomeUtente}</span>
          ) : (
            <span className="non-disponibile">—</span>
          )}
        </td>
        <td>
          <SceltaRuolo
            valore={richiesta?.tipo === 'accesso' ? richiesta.ruolo : ruolo}
            disabled={inCorso || sonoIo}
            onChange={cambiaRuolo}
            ariaLabel={`Ruolo: ${chi}`}
          />
          {utente.nomeUtente && puoIncassare(ruolo) && (
            <label className="lettera-in-tabella">
              Cassa
              <SceltaLetteraCassa
                valore={utente.letteraCassa ?? null}
                disabled={inCorso}
                onChange={(letteraCassa) => esegui(() => impostaLetteraCassa({ uid: utente.uid, letteraCassa }))}
                ariaLabel={`Lettera della cassa: ${chi}`}
              />
            </label>
          )}
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={utente.attivo}
            disabled={inCorso || sonoIo}
            onChange={(e) => esegui(() => impostaAttivo({ uid: utente.uid, attivo: e.target.checked }))}
            aria-label={`Attivo: ${chi}`}
          />
        </td>
        <td>
          <div className="azioni">
            <button
              type="button"
              disabled={inCorso}
              onClick={() => setRichiesta({ tipo: 'nome', nome: utente.nome, cognome: utente.cognome ?? '' })}
            >
              Modifica nome
            </button>
            {utente.nomeUtente && (
              <button type="button" disabled={inCorso} onClick={() => setRichiesta({ tipo: 'password', password: '' })}>
                Cambia password
              </button>
            )}
            {!sonoIo && (
              <button type="button" className="bottone-elimina" disabled={inCorso} onClick={elimina}>
                Elimina
              </button>
            )}
          </div>
        </td>
      </tr>

      {richiesta && (
        <tr className="riga-richiesta">
          <td colSpan={COLONNE}>
            <form className="richiesta" onSubmit={conferma}>
              {richiesta.tipo === 'nome' && (
                <>
                  <label>
                    Nome
                    <input
                      type="text"
                      value={richiesta.nome}
                      onChange={(e) => setRichiesta({ ...richiesta, nome: e.target.value })}
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    Cognome
                    <input
                      type="text"
                      value={richiesta.cognome}
                      onChange={(e) => setRichiesta({ ...richiesta, cognome: e.target.value })}
                      required
                    />
                  </label>
                </>
              )}
              {richiesta.tipo === 'password' && (
                <label>
                  Nuova password per {chi}
                  <input
                    type="text"
                    value={richiesta.password}
                    placeholder="almeno 8 caratteri"
                    onChange={(e) => setRichiesta({ ...richiesta, password: e.target.value })}
                    required
                    autoFocus
                  />
                </label>
              )}
              {richiesta.tipo === 'accesso' && (
                <>
                  <p className="spiegazione">
                    Per entrare come <strong>{NOME_RUOLO[richiesta.ruolo]}</strong>, {chi} ha bisogno di un nome utente
                    e di una password.
                  </p>
                  <label>
                    N. utente
                    <input
                      type="text"
                      value={richiesta.nomeUtente}
                      placeholder="mario.rossi"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      onChange={(e) => setRichiesta({ ...richiesta, nomeUtente: e.target.value.toLowerCase() })}
                      required
                      autoFocus
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="text"
                      value={richiesta.password}
                      placeholder="almeno 8 caratteri"
                      onChange={(e) => setRichiesta({ ...richiesta, password: e.target.value })}
                      required
                    />
                  </label>
                </>
              )}
              <button type="submit" className="bottone-principale" disabled={inCorso}>
                Salva
              </button>
              <button
                type="button"
                disabled={inCorso}
                onClick={() => {
                  setRichiesta(null);
                  setErrore(null);
                }}
              >
                Annulla
              </button>
            </form>
          </td>
        </tr>
      )}

      {errore && (
        <tr>
          <td colSpan={COLONNE}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

/** L'elenco viene richiesto qui e non nella schermata principale: solo qui si
 * è certi che l'accesso sia già avvenuto, altrimenti Firestore rifiuterebbe
 * la lettura e non riproverebbe più. */
export function TabellaUtenti({ uidCorrente }: { uidCorrente: string }) {
  const utenti = useUtenti();

  if (utenti.length === 0) {
    return <p className="vuoto">Nessuna persona: aggiungila qui sopra.</p>;
  }

  return (
    <div className="tabella-scroll">
      <table className="tabella-utenti">
        <thead>
          <tr>
            <th>Cognome</th>
            <th>Nome</th>
            <th>N. utente</th>
            <th>Ruolo</th>
            <th className="centro">Attivo</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {utenti.map((utente) => (
            <RigaUtente key={utente.uid} utente={utente} sonoIo={utente.uid === uidCorrente} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
