import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
  CATEGORIE,
  NOME_CATEGORIA,
  NOME_SETTORE,
  SETTORI,
  type Categoria,
  type DisponibilitaProdotto,
  type Prodotto,
  type Settore,
} from '@sagra-mazzocco/shared';
import { useDisponibilita, useProdotti } from '../hooks';
import { impostaPorzioni, messaggioErrore, segnaEsaurito } from '../services/callables';
import { db } from '../services/firebase';
import { SERATA_ID_OGGI } from '../services/serata';

/** Il prezzo si scrive e si legge all'italiana: "12,50 €". */
function prezzoInTesto(valore: number): string {
  return `${valore.toFixed(2).replace('.', ',')} €`;
}

/** Accetta "12,50 €", "12.5", "12" e simili. Restituisce null se non è un
 * prezzo valido, così la casella torna al valore di prima. */
function prezzoDaTesto(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(',', '.');
  const numero = Number(pulito);
  if (pulito === '' || Number.isNaN(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
}

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

  function salvaPrezzo(e: React.FocusEvent<HTMLInputElement>) {
    const nuovo = prezzoDaTesto(e.target.value);
    if (nuovo === null || nuovo === prodotto.prezzo) {
      e.target.value = prezzoInTesto(prodotto.prezzo);
      return;
    }
    e.target.value = prezzoInTesto(nuovo);
    salvaCampo({ prezzo: nuovo });
  }

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
          <select
            value={prodotto.categoria ?? 'primi'}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ categoria: e.target.value as Categoria })}
            aria-label={`Categoria di ${prodotto.nome}`}
          >
            {CATEGORIE.map((categoria) => (
              <option key={categoria} value={categoria}>
                {NOME_CATEGORIA[categoria]}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            value={prodotto.settore ?? 'cucina'}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ settore: e.target.value as Settore })}
            aria-label={`Settore di ${prodotto.nome}`}
          >
            {SETTORI.map((settore) => (
              <option key={settore} value={settore}>
                {NOME_SETTORE[settore]}
              </option>
            ))}
          </select>
        </td>
        <td className="colonna-piatto">
          <input
            type="text"
            defaultValue={prodotto.nome}
            disabled={inCorso}
            onBlur={(e) => e.target.value !== prodotto.nome && salvaCampo({ nome: e.target.value })}
            aria-label={`Nome di ${prodotto.nome}`}
          />
        </td>
        <td className="colonna-note">
          <input
            type="text"
            placeholder="ingredienti, contorno…"
            defaultValue={prodotto.note ?? ''}
            disabled={inCorso}
            onBlur={(e) => e.target.value !== (prodotto.note ?? '') && salvaCampo({ note: e.target.value })}
            aria-label={`Note di ${prodotto.nome}`}
          />
        </td>
        <td>
          <input
            type="text"
            inputMode="decimal"
            className="prezzo"
            placeholder="--,-- €"
            defaultValue={prezzoInTesto(prodotto.prezzo)}
            disabled={inCorso}
            onBlur={salvaPrezzo}
            aria-label={`Prezzo di ${prodotto.nome}`}
          />
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
        <td className="centro">
          <input
            type="number"
            min="0"
            className="porzioni"
            placeholder="∞"
            value={porzioni}
            disabled={inCorso}
            onChange={(e) => setPorzioni(e.target.value)}
            onBlur={salvaPorzioni}
            aria-label={`Porzioni di serata per ${prodotto.nome}`}
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
          <td colSpan={10}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function NuovoPiatto() {
  const [categoria, setCategoria] = useState<Categoria>('primi');
  const [settore, setSettore] = useState<Settore>('cucina');
  const [nome, setNome] = useState('');
  const [note, setNote] = useState('');
  const [prezzo, setPrezzo] = useState('');
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
      const valore = prezzoDaTesto(prezzo);
      if (valore === null) throw new Error('Prezzo non valido: scrivilo come 12,50.');
      const prodotto: Prodotto = {
        id,
        categoria,
        settore,
        nome: nome.trim(),
        note: note.trim(),
        prezzo: valore,
        novita,
        esauritoSerata: null,
      };
      await setDoc(doc(db, 'prodotti', id), prodotto);
      setNome('');
      setNote('');
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
        Categoria
        <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)}>
          {CATEGORIE.map((c) => (
            <option key={c} value={c}>
              {NOME_CATEGORIA[c]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Settore
        <select value={settore} onChange={(e) => setSettore(e.target.value as Settore)}>
          {SETTORI.map((s) => (
            <option key={s} value={s}>
              {NOME_SETTORE[s]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Piatto
        <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </label>
      <label>
        Note
        <input
          type="text"
          placeholder="ingredienti, contorno…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <label>
        Prezzo
        <input
          type="text"
          inputMode="decimal"
          placeholder="--,-- €"
          value={prezzo}
          onChange={(e) => setPrezzo(e.target.value)}
          required
        />
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
          tocca gli ordini già incassati. Il settore e le porzioni di serata restano interni: il cliente non li
          vede. Le porzioni valgono per la serata di oggi — lasciale vuote per i piatti senza limite.
        </p>
        {prodotti.length === 0 ? (
          <p className="vuoto">Nessun piatto: aggiungi il primo qui sopra.</p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-menu">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Settore</th>
                  <th>Piatto</th>
                  <th>Note</th>
                  <th>Prezzo</th>
                  <th className="centro">Novità</th>
                  <th className="centro">Porzioni di serata</th>
                  <th className="centro">Porzioni residue</th>
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
