import { useState } from 'react';
import { NOME_RUOLO_COMANDE, RUOLI_COMANDE, type RuoloComande, type Utente } from '@sagra-mazzocco/shared';
import { useUtenti } from '../hooks';
import {
  aggiornaPermessi,
  eliminaUtente,
  impostaAttivo,
  messaggioErrore,
  reimpostaPassword,
} from '../services/callables';

/** Le app ancora da costruire compaiono già in tabella, ma disattivate:
 * i loro ruoli si definiranno quando verranno realizzate. */
const APP_FUTURE = ['Magazzino', 'Contabilità'];

function RigaUtente({ utente, sonoIo }: { utente: Utente; sonoIo: boolean }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovaPassword, setNuovaPassword] = useState<string | null>(null);

  async function esegui(operazione: () => Promise<unknown>) {
    setErrore(null);
    setInCorso(true);
    try {
      await operazione();
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  const cambiaAmministratore = (amministratore: boolean) =>
    esegui(() => aggiornaPermessi({ uid: utente.uid, amministratore, accessi: utente.accessi }));

  const cambiaComande = (ruolo: RuoloComande, spuntato: boolean) => {
    const attuali = utente.accessi.comande ?? [];
    const nuovi = spuntato ? [...attuali, ruolo] : attuali.filter((r) => r !== ruolo);
    return esegui(() =>
      aggiornaPermessi({
        uid: utente.uid,
        amministratore: utente.amministratore,
        accessi: nuovi.length > 0 ? { comande: nuovi } : {},
      })
    );
  };

  const cambiaAttivo = (attivo: boolean) => esegui(() => impostaAttivo({ uid: utente.uid, attivo }));

  async function elimina() {
    const conferma = window.confirm(
      `Sei sicuro di voler eliminare definitivamente l'account di ${utente.nome} (${utente.nomeUtente})?`
    );
    if (!conferma) return;
    await esegui(() => eliminaUtente({ uid: utente.uid }));
  }

  async function salvaPassword() {
    if (!nuovaPassword) return;
    await esegui(async () => {
      await reimpostaPassword({ uid: utente.uid, password: nuovaPassword });
      setNuovaPassword(null);
    });
  }

  return (
    <>
      <tr className={utente.attivo ? undefined : 'disattivato'}>
        <td>
          <span className="nome">{utente.nome}</span>
          {sonoIo && <span className="etichetta-io">tu</span>}
        </td>
        <td className="mono">{utente.nomeUtente}</td>
        <td className="centro">
          <input
            type="checkbox"
            checked={utente.attivo}
            disabled={inCorso || sonoIo}
            onChange={(e) => cambiaAttivo(e.target.checked)}
            aria-label={`Attivo: ${utente.nome}`}
          />
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={utente.amministratore}
            disabled={inCorso || sonoIo}
            onChange={(e) => cambiaAmministratore(e.target.checked)}
            aria-label={`Amministratore: ${utente.nome}`}
          />
        </td>
        <td>
          {utente.amministratore ? (
            <span className="tutto">tutto</span>
          ) : (
            <div className="caselle-ruoli">
              {RUOLI_COMANDE.map((ruolo) => (
                <label key={ruolo}>
                  <input
                    type="checkbox"
                    checked={(utente.accessi.comande ?? []).includes(ruolo)}
                    disabled={inCorso}
                    onChange={(e) => cambiaComande(ruolo, e.target.checked)}
                    aria-label={`${NOME_RUOLO_COMANDE[ruolo]} in Comande: ${utente.nome}`}
                  />
                  {NOME_RUOLO_COMANDE[ruolo]}
                </label>
              ))}
            </div>
          )}
        </td>
        {APP_FUTURE.map((app) => (
          <td key={app} className="centro">
            <span className="non-disponibile" title={`${app} non è ancora stata realizzata`}>
              —
            </span>
          </td>
        ))}
        <td className="azioni">
          {nuovaPassword === null ? (
            <>
              <button type="button" disabled={inCorso} onClick={() => setNuovaPassword('')}>
                Cambia password
              </button>
              {!sonoIo && (
                <button type="button" className="bottone-elimina" disabled={inCorso} onClick={elimina}>
                  Elimina
                </button>
              )}
            </>
          ) : (
            <span className="cambio-password">
              <input
                type="text"
                value={nuovaPassword}
                placeholder="almeno 8 caratteri"
                onChange={(e) => setNuovaPassword(e.target.value)}
                autoFocus
              />
              <button type="button" disabled={inCorso} onClick={salvaPassword}>
                Salva
              </button>
              <button type="button" disabled={inCorso} onClick={() => setNuovaPassword(null)}>
                Annulla
              </button>
            </span>
          )}
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={7 + APP_FUTURE.length}>
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
    return <p className="vuoto">Nessun utente: creane uno qui sopra.</p>;
  }

  return (
    <div className="tabella-scroll">
      <table className="tabella-utenti">
        <thead>
          <tr>
            <th>Persona</th>
            <th>Nome utente</th>
            <th className="centro">Attivo</th>
            <th className="centro">Amministratore</th>
            <th>Comande</th>
            {APP_FUTURE.map((app) => (
              <th key={app} className="centro colonna-futura">
                {app}
              </th>
            ))}
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
