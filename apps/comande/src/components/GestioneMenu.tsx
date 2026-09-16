import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import type { DisponibilitaProdotto, Prodotto, Reparto } from '@sagra-mazzocco/shared';
import { useDisponibilita, useProdotti } from '../hooks';
import { impostaPorzioni, messaggioErrore, segnaEsaurito } from '../services/callables';
import { db } from '../services/firebase';
import { SERATA_ID_OGGI } from '../services/serata';

const REPARTI: Reparto[] = ['cucina', 'bevande'];
const NOME_REPARTO: Record<Reparto, string> = { cucina: 'Cucina', bevande: 'Bevande' };

function idDaNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

function RigaPiatto({ prodotto, disponibilita }: { prodotto: Prodotto; disponibilita?: DisponibilitaProdotto }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [porzioni, setPorzioni] = useState(
    disponibilita?.porzioniMassime === null || disponibilita === undefined
      ? ''
      : String(disponibilita.porzioniMassime)
  );

  const venduti = disponibilita?.venduti ?? 0;
  const massime = disponibilita?.porzioniMassime ?? null;
  const rimaste = massime === null ? null : Math.max(0, massime - venduti);
  const finito = prodotto.esauritoSerata === SERATA_ID_OGGI;

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

  const salvaCampo = (campi: Partial<Prodotto>) => esegui(() => updateDoc(doc(db, 'prodotti', prodotto.id), campi));

  function salvaPorzioni() {
    const valore = porzioni.trim() === '' ? null : Number(porzioni);
    if (valore === massime) return;
    return esegui(() => impostaPorzioni({ serataId: SERATA_ID_OGGI, prodottoId: prodotto.id, porzioniMassime: valore }));
  }

  async function elimina() {
    if (!window.confirm(`Eliminare "${prodotto.nome}" dal menù?`)) return;
    await esegui(() => deleteDoc(doc(db, 'prodotti', prodotto.id)));
  }

  return (
    <>
      <tr className={finito ? 'finito' : undefined}>
        <td>
          <input
            type="text"
            defaultValue={prodotto.nome}
            disabled={inCorso}
            onBlur={(e) => e.target.value !== prodotto.nome && salvaCampo({ nome: e.target.value })}
            aria-label={`Nome di ${prodotto.nome}`}
          />
        </td>
        <td className="stretta">
          <input
            type="number"
            min="0"
            step="0.5"
            defaultValue={prodotto.prezzo}
            disabled={inCorso}
            onBlur={(e) => Number(e.target.value) !== prodotto.prezzo && salvaCampo({ prezzo: Number(e.target.value) })}
            aria-label={`Prezzo di ${prodotto.nome}`}
          />
        </td>
        <td className="stretta">
          <select
            value={prodotto.reparto}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ reparto: e.target.value as Reparto })}
            aria-label={`Reparto di ${prodotto.nome}`}
          >
            {REPARTI.map((reparto) => (
              <option key={reparto} value={reparto}>
                {NOME_REPARTO[reparto]}
              </option>
            ))}
          </select>
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={prodotto.novita}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ novita: e.target.checked })}
            aria-label={`Novità: ${prodotto.nome}`}
          />
        </td>
        <td className="stretta">
          <input
            type="number"
            min="0"
            placeholder="illimitato"
            value={porzioni}
            disabled={inCorso}
            onChange={(e) => setPorzioni(e.target.value)}
            onBlur={salvaPorzioni}
            aria-label={`Porzioni di stasera per ${prodotto.nome}`}
          />
        </td>
        <td className="centro conteggio">
          {massime === null ? <span className="illimitato">—</span> : <strong>{rimaste}</strong>}
          <small>{venduti} venduti</small>
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={finito}
            disabled={inCorso}
            onChange={(e) =>
              esegui(() => segnaEsaurito({ serataId: SERATA_ID_OGGI, prodottoId: prodotto.id, esaurito: e.target.checked }))
            }
            aria-label={`Esaurito: ${prodotto.nome}`}
          />
        </td>
        <td>
          <button type="button" className="bottone-annulla" disabled={inCorso} onClick={elimina}>
            Elimina
          </button>
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={8}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function NuovoPiatto() {
  const [nome, setNome] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [reparto, setReparto] = useState<Reparto>('cucina');
  const [novita, setNovita] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setInCorso(true);
    try {
      const id = idDaNome(nome);
      if (!id) throw new Error('Nome non valido.');
      const prodotto: Prodotto = {
        id,
        nome: nome.trim(),
        prezzo: Number(prezzo),
        reparto,
        novita,
        esauritoSerata: null,
      };
      await setDoc(doc(db, 'prodotti', id), prodotto);
      setNome('');
      setPrezzo('');
      setNovita(false);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form className="nuovo-piatto" onSubmit={handleSubmit}>
      <label>
        Nome del piatto
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label>
        Prezzo
        <input type="number" min="0" step="0.5" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} required />
      </label>
      <label>
        Reparto
        <select value={reparto} onChange={(e) => setReparto(e.target.value as Reparto)}>
          {REPARTI.map((r) => (
            <option key={r} value={r}>
              {NOME_REPARTO[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="riga-flag">
        <input type="checkbox" checked={novita} onChange={(e) => setNovita(e.target.checked)} />
        Novità
      </label>
      {errore && <p className="errore">{errore}</p>}
      <button type="submit" className="bottone-principale" disabled={inCorso}>
        {inCorso ? 'Salvataggio…' : 'Aggiungi al menù'}
      </button>
    </form>
  );
}

export function GestioneMenu() {
  const prodotti = useProdotti();
  const disponibilita = useDisponibilita();

  return (
    <div className="area gestione-menu">
      <section className="riquadro">
        <h2>Aggiungi un piatto</h2>
        <NuovoPiatto />
      </section>

      <section className="riquadro">
        <h2>Menù ({prodotti.length})</h2>
        <p className="spiegazione">
          Le modifiche si salvano da sole e valgono subito ovunque, anche nel menù dal QR. Cambiare un prezzo non
          tocca gli ordini già incassati. Le porzioni valgono per la serata di oggi: lasciale vuote per i piatti
          senza limite.
        </p>
        {prodotti.length === 0 ? (
          <p className="vuoto">Nessun piatto: aggiungi il primo qui sopra.</p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-menu">
              <thead>
                <tr>
                  <th>Piatto</th>
                  <th className="stretta">Prezzo</th>
                  <th className="stretta">Reparto</th>
                  <th className="centro">Novità</th>
                  <th className="stretta">Porzioni di stasera</th>
                  <th className="centro">Rimaste</th>
                  <th className="centro">Esaurito</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {prodotti.map((prodotto) => (
                  <RigaPiatto
                    key={prodotto.id}
                    prodotto={prodotto}
                    disponibilita={disponibilita.get(prodotto.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
