import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import {
  CATEGORIE_USCITA,
  NOME_CATEGORIA_USCITA,
  idSerata,
  type CategoriaUscita,
  type Serata,
  type Uscita,
} from '@sagra-mazzocco/shared';
import { useUscite } from '../hooks';
import { arrotonda, usciteReali } from '../services/conti';
import { db } from '../services/firebase';
import { euro, importoDaTesto } from '../services/formato';
import { nomeSerata } from './SceltaSerata';

/** Le spese.
 *
 * Il modo in cui vengono inserite conta più di quello che sanno fare: durante
 * la sagra nessuno si mette a battere fatture. Quindi tre campi e via, e la
 * possibilità di scriverle prima come preventivo e spuntarle quando diventano
 * vere. Un preventivo non entra nell'utile finché non è pagato. */
export function Uscite({ edizioneId, serate }: { edizioneId: string; serate: Serata[] }) {
  const uscite = useUscite(edizioneId);
  const [categoria, setCategoria] = useState<CategoriaUscita>('fornitori-cibo');
  const [descrizione, setDescrizione] = useState('');
  const [fornitore, setFornitore] = useState('');
  const [importo, setImporto] = useState('');
  const [data, setData] = useState(idSerata());
  const [serataId, setSerataId] = useState('');
  const [pagata, setPagata] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const totali = useMemo(() => {
    const pagate = arrotonda(usciteReali(uscite).reduce((somma, u) => somma + u.importo, 0));
    const previste = arrotonda(uscite.filter((u) => !u.pagata).reduce((somma, u) => somma + u.importo, 0));
    return { pagate, previste };
  }, [uscite]);

  const perCategoria = useMemo(() => {
    const mappa = new Map<CategoriaUscita, number>();
    for (const uscita of usciteReali(uscite)) {
      mappa.set(uscita.categoria, arrotonda((mappa.get(uscita.categoria) ?? 0) + uscita.importo));
    }
    return [...mappa.entries()].sort(([, a], [, b]) => b - a);
  }, [uscite]);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    const valore = importoDaTesto(importo);
    if (!descrizione.trim()) return setErrore('Scrivi cosa hai comprato.');
    if (valore === null || valore <= 0) return setErrore('Importo non valido: scrivi per esempio 125,50.');

    setInCorso(true);
    setErrore(null);
    try {
      const elenco = collection(db, `edizioni/${edizioneId}/uscite`);
      const uscita: Omit<Uscita, 'id'> = {
        edizioneId,
        categoria,
        descrizione: descrizione.trim(),
        fornitore: fornitore.trim(),
        importo: valore,
        data,
        serataId: serataId || null,
        pagata,
        immagineId: null,
        createdAt: serverTimestamp() as unknown as Uscita['createdAt'],
      };
      // L'id lo genera Firestore e poi lo si riscrive dentro il documento,
      // così ogni riga conosce il proprio identificativo come tutte le altre
      // dell'archivio.
      const creata = await addDoc(elenco, uscita);
      await updateDoc(creata, { id: creata.id });
      setDescrizione('');
      setFornitore('');
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
        <h2>Nuova spesa</h2>
        <p className="spiegazione">
          Si può inserire anche prima della sagra, come preventivo: togli la spunta a "già pagata" e non entrerà
          nell'utile finché non la spunti. Una spesa è <strong>di una serata</strong> solo quando ha davvero senso
          (il ghiaccio di sabato); la tensostruttura è dell'evento.
        </p>

        <form className="modulo-movimento" onSubmit={aggiungi}>
          <label className="campo-largo">
            Cosa
            <input
              type="text"
              placeholder="es. 40 kg di salsiccia"
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
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaUscita)}>
              {CATEGORIE_USCITA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fornitore
            <input type="text" placeholder="facoltativo" value={fornitore} onChange={(e) => setFornitore(e.target.value)} />
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
            <input type="checkbox" checked={pagata} onChange={(e) => setPagata(e.target.checked)} />
            Già pagata
          </label>
          <button type="submit" className="bottone-principale" disabled={inCorso}>
            {inCorso ? 'Salvo…' : 'Aggiungi spesa'}
          </button>
        </form>

        {errore && <p className="errore">{errore}</p>}
      </section>

      <div className="riga-quadrati">
        <section className="quadrato quadrato-uscita">
          <h3>Speso finora</h3>
          <p className="valore-quadrato">{euro(totali.pagate)}</p>
          <p className="spiegazione">Solo le spese già pagate</p>
        </section>
        <section className="quadrato quadrato-conteggio">
          <h3>Ancora da pagare</h3>
          <p className="valore-quadrato">{euro(totali.previste)}</p>
          <p className="spiegazione">Preventivi non ancora spuntati</p>
        </section>
      </div>

      {perCategoria.length > 0 && (
        <section className="riquadro">
          <h2>Dove sono andati i soldi</h2>
          <table className="tabella-conti">
            <tbody>
              {perCategoria.map(([cat, somma]) => (
                <tr key={cat}>
                  <td>{NOME_CATEGORIA_USCITA[cat]}</td>
                  <td className="destra">
                    <strong>{euro(somma)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="riquadro">
        <h2>Tutte le spese ({uscite.length})</h2>
        {uscite.length === 0 ? (
          <p className="vuoto">Ancora nessuna spesa inserita.</p>
        ) : (
          <table className="tabella-conti tabella-movimenti">
            <thead>
              <tr>
                <th>Data</th>
                <th>Cosa</th>
                <th>Categoria</th>
                <th>Quando</th>
                <th className="destra">Importo</th>
                <th className="centro">Pagata</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {uscite.map((uscita) => (
                <tr key={uscita.id} className={uscita.pagata ? undefined : 'preventivo'}>
                  <td>{uscita.data}</td>
                  <td>
                    {uscita.descrizione}
                    {uscita.fornitore && <small> · {uscita.fornitore}</small>}
                  </td>
                  <td>{NOME_CATEGORIA_USCITA[uscita.categoria]}</td>
                  <td>{uscita.serataId ? nomeSerata(uscita.serataId) : "Evento intero"}</td>
                  <td className="destra">
                    <strong>{euro(uscita.importo)}</strong>
                  </td>
                  <td className="centro">
                    <input
                      type="checkbox"
                      checked={uscita.pagata}
                      aria-label={`Pagata: ${uscita.descrizione}`}
                      onChange={(e) =>
                        updateDoc(doc(db, `edizioni/${edizioneId}/uscite`, uscita.id), { pagata: e.target.checked })
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="bottone-elimina"
                      onClick={() =>
                        window.confirm(`Eliminare "${uscita.descrizione}"?`) &&
                        deleteDoc(doc(db, `edizioni/${edizioneId}/uscite`, uscita.id))
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
