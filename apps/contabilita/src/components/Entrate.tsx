import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import {
  CATEGORIE_ENTRATA,
  NOME_CATEGORIA_ENTRATA,
  idSerata,
  type CategoriaEntrata,
  type EntrataExtra,
  type Serata,
} from '@sagra-mazzocco/shared';
import { useEntrate } from '../hooks';
import { arrotonda, entrateReali } from '../services/conti';
import { db } from '../services/firebase';
import { euro, importoDaTesto } from '../services/formato';
import { nomeSerata } from './SceltaSerata';

/** I soldi che entrano senza passare dalla cassa: sponsor, lotteria,
 * bancarelle, quote, offerte.
 *
 * Come per le spese, si possono scrivere prima (uno sponsor promesso) e
 * spuntare quando arrivano davvero: una promessa non è un incasso. */
export function Entrate({ edizioneId, serate }: { edizioneId: string; serate: Serata[] }) {
  const entrate = useEntrate(edizioneId);
  const [categoria, setCategoria] = useState<CategoriaEntrata>('sponsor');
  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [data, setData] = useState(idSerata());
  const [serataId, setSerataId] = useState('');
  const [incassata, setIncassata] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const totali = useMemo(() => {
    const dentro = arrotonda(entrateReali(entrate).reduce((somma, e) => somma + e.importo, 0));
    const attese = arrotonda(entrate.filter((e) => !e.incassata).reduce((somma, e) => somma + e.importo, 0));
    return { dentro, attese };
  }, [entrate]);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    const valore = importoDaTesto(importo);
    if (!descrizione.trim()) return setErrore('Scrivi da dove arrivano.');
    if (valore === null || valore <= 0) return setErrore('Importo non valido: scrivi per esempio 250,00.');

    setInCorso(true);
    setErrore(null);
    try {
      const elenco = collection(db, `edizioni/${edizioneId}/entrate`);
      const entrata: Omit<EntrataExtra, 'id'> = {
        edizioneId,
        categoria,
        descrizione: descrizione.trim(),
        importo: valore,
        data,
        serataId: serataId || null,
        incassata,
        immagineId: null,
        createdAt: serverTimestamp() as unknown as EntrataExtra['createdAt'],
      };
      const creata = await addDoc(elenco, entrata);
      await updateDoc(creata, { id: creata.id });
      setDescrizione('');
      setImporto('');
    } catch (err) {
      setErrore((err as Error).message);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="movimenti">
      <section className="riquadro">
        <h2>Nuova entrata</h2>
        <p className="spiegazione">
          Quello che non passa dalle casse. Uno sponsor promesso e non ancora arrivato si scrive lo stesso: togli la
          spunta a "già incassata" e non entrerà nell'utile finché non arriva.
        </p>

        <form className="modulo-movimento" onSubmit={aggiungi}>
          <label className="campo-largo">
            Da dove
            <input
              type="text"
              placeholder="es. Sponsor Ferramenta Rossi"
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              required
            />
          </label>
          <label>
            Importo
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              required
            />
          </label>
          <label>
            Categoria
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaEntrata)}>
              {CATEGORIE_ENTRATA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
          <label>
            Serata
            <select value={serataId} onChange={(e) => setSerataId(e.target.value)}>
              <option value="">Dell'evento intero</option>
              {serate.map((s) => (
                <option key={s.id} value={s.id}>
                  {nomeSerata(s.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="riga-spunta">
            <input type="checkbox" checked={incassata} onChange={(e) => setIncassata(e.target.checked)} />
            Già incassata
          </label>
          <button type="submit" className="bottone-principale" disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Aggiungi entrata'}
          </button>
        </form>

        {errore && <p className="errore">{errore}</p>}
      </section>

      <div className="riga-quadrati">
        <section className="quadrato quadrato-incasso">
          <h3>Incassato fuori cassa</h3>
          <p className="valore-quadrato">{euro(totali.dentro)}</p>
          <p className="spiegazione">Sponsor, lotteria, bancarelle…</p>
        </section>
        <section className="quadrato quadrato-conteggio">
          <h3>Promesso, non ancora arrivato</h3>
          <p className="valore-quadrato">{euro(totali.attese)}</p>
          <p className="spiegazione">Non entra nell'utile</p>
        </section>
      </div>

      <section className="riquadro">
        <h2>Tutte le entrate extra ({entrate.length})</h2>
        {entrate.length === 0 ? (
          <p className="vuoto">Ancora nessuna entrata fuori cassa.</p>
        ) : (
          <table className="tabella-conti tabella-movimenti">
            <thead>
              <tr>
                <th>Data</th>
                <th>Da dove</th>
                <th>Categoria</th>
                <th>Quando</th>
                <th className="destra">Importo</th>
                <th className="centro">Incassata</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entrate.map((entrata) => (
                <tr key={entrata.id} className={entrata.incassata ? undefined : 'preventivo'}>
                  <td>{entrata.data}</td>
                  <td>{entrata.descrizione}</td>
                  <td>{NOME_CATEGORIA_ENTRATA[entrata.categoria]}</td>
                  <td>{entrata.serataId ? nomeSerata(entrata.serataId) : "Evento intero"}</td>
                  <td className="destra">
                    <strong>{euro(entrata.importo)}</strong>
                  </td>
                  <td className="centro">
                    <input
                      type="checkbox"
                      checked={entrata.incassata}
                      aria-label={`Incassata: ${entrata.descrizione}`}
                      onChange={(e) =>
                        updateDoc(doc(db, `edizioni/${edizioneId}/entrate`, entrata.id), {
                          incassata: e.target.checked,
                        })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bottone-elimina"
                      onClick={() =>
                        window.confirm(`Eliminare "${entrata.descrizione}"?`) &&
                        deleteDoc(doc(db, `edizioni/${edizioneId}/entrate`, entrata.id))
                      }
                    >
                      Elimina
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
