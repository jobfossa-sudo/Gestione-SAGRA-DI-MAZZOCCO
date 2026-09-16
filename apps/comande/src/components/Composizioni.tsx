import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import {
  NOME_SETTORE,
  SETTORI,
  type Componente,
  type Prodotto,
  type RigaComposizione,
  type Settore,
} from '@sagra-mazzocco/shared';
import { useCategorie, useComponenti, useProdotti } from '../hooks';
import { messaggioErrore } from '../services/callables';
import { db } from '../services/firebase';
import { idLibero } from '../services/identificativi';
import { quantitaDaTesto, quantitaInTesto } from '../services/quantita';

// ---------------------------------------------------------------------------
// Elenco dei componenti
// ---------------------------------------------------------------------------

function RigaComponente({ componente, usatoIn }: { componente: Componente; usatoIn: string[] }) {
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(campi: Partial<Componente>) {
    setErrore(null);
    try {
      await updateDoc(doc(db, 'componenti', componente.id), campi);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  async function elimina() {
    // Un componente in uso non si cancella: i piatti che lo contengono
    // perderebbero un pezzo senza che nessuno se ne accorga.
    if (usatoIn.length > 0) {
      setErrore(`È usato in: ${usatoIn.join(', ')}. Toglilo prima da quei piatti.`);
      return;
    }
    if (!window.confirm(`Eliminare il componente "${componente.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'componenti', componente.id));
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  return (
    <>
      <tr>
        <td>
          <input
            type="text"
            defaultValue={componente.nome}
            onBlur={(e) =>
              e.target.value.trim() && e.target.value !== componente.nome && salva({ nome: e.target.value.trim() })
            }
            aria-label={`Nome del componente ${componente.nome}`}
          />
        </td>
        <td>
          <select
            value={componente.settore}
            onChange={(e) => salva({ settore: e.target.value as Settore })}
            aria-label={`Settore di ${componente.nome}`}
          >
            {SETTORI.map((s) => (
              <option key={s} value={s}>
                {NOME_SETTORE[s]}
              </option>
            ))}
          </select>
        </td>
        <td className="usato-in">
          {usatoIn.length === 0 ? <span className="illimitato">non usato</span> : usatoIn.join(', ')}
        </td>
        <td>
          <button type="button" className="bottone-annulla" onClick={elimina}>
            Elimina
          </button>
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={4}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

function NuovoComponente({ idPresi }: { idPresi: Set<string> }) {
  const [nome, setNome] = useState('');
  const [settore, setSettore] = useState<Settore>('griglia');
  const [errore, setErrore] = useState<string | null>(null);

  async function aggiungi() {
    setErrore(null);
    if (!nome.trim()) return;
    try {
      const id = idLibero(nome, idPresi);
      const componente: Componente = { id, nome: nome.trim(), settore };
      await setDoc(doc(db, 'componenti', id), componente);
      setNome('');
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  return (
    <>
      <tr className="riga-aggiunta">
        <td>
          <input
            type="text"
            placeholder="es. Pollo, Salsiccia, Costicina"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Nome del nuovo componente"
          />
        </td>
        <td>
          <select value={settore} onChange={(e) => setSettore(e.target.value as Settore)} aria-label="Settore del nuovo componente">
            {SETTORI.map((s) => (
              <option key={s} value={s}>
                {NOME_SETTORE[s]}
              </option>
            ))}
          </select>
        </td>
        <td></td>
        <td>
          <button type="button" className="bottone-aggiungi" disabled={!nome.trim()} onClick={aggiungi}>
            Aggiungi
          </button>
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={4}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Composizione di un piatto
// ---------------------------------------------------------------------------

function ComposizionePiatto({
  prodotto,
  componenti,
}: {
  prodotto: Prodotto;
  componenti: Map<string, Componente>;
}) {
  const composizione = (prodotto.composizione ?? []).filter((voce) => componenti.has(voce.componenteId));
  const [nuovoId, setNuovoId] = useState('');
  const [nuovaQuantita, setNuovaQuantita] = useState('1');
  const [errore, setErrore] = useState<string | null>(null);

  async function salva(nuova: RigaComposizione[]) {
    setErrore(null);
    try {
      await updateDoc(doc(db, 'prodotti', prodotto.id), { composizione: nuova });
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  function cambiaQuantita(componenteId: string, testo: string, input: HTMLInputElement) {
    const valore = quantitaDaTesto(testo);
    const attuale = composizione.find((v) => v.componenteId === componenteId)!;
    if (valore === null) {
      input.value = quantitaInTesto(attuale.quantita);
      setErrore('Quantità non valida: scrivi per esempio 2, 0,5 oppure 1/2.');
      return;
    }
    if (valore === attuale.quantita) return;
    input.value = quantitaInTesto(valore);
    salva(composizione.map((v) => (v.componenteId === componenteId ? { ...v, quantita: valore } : v)));
  }

  function aggiungi() {
    const valore = quantitaDaTesto(nuovaQuantita);
    if (!nuovoId) return;
    if (valore === null) {
      setErrore('Quantità non valida: scrivi per esempio 2, 0,5 oppure 1/2.');
      return;
    }
    // Se il componente c'è già, si somma invece di duplicare la riga.
    const esistente = composizione.find((v) => v.componenteId === nuovoId);
    const nuova = esistente
      ? composizione.map((v) => (v.componenteId === nuovoId ? { ...v, quantita: v.quantita + valore } : v))
      : [...composizione, { componenteId: nuovoId, quantita: valore }];
    salva(nuova);
    setNuovoId('');
    setNuovaQuantita('1');
  }

  const settoriAlLavoro = composizione.length
    ? [...new Set(composizione.map((v) => componenti.get(v.componenteId)!.settore))]
    : [prodotto.settore ?? 'cucina'];

  return (
    <article className="composizione-piatto">
      <header>
        <h3>{prodotto.nome}</h3>
        <span className="settori-al-lavoro">
          {settoriAlLavoro.map((s) => (
            <span key={s} className={`targhetta-settore settore-${s}`}>
              {NOME_SETTORE[s]}
            </span>
          ))}
        </span>
      </header>

      {composizione.length === 0 ? (
        <p className="pezzo-unico">
          Pezzo unico: il settore {NOME_SETTORE[prodotto.settore ?? 'cucina']} lo prepara così com'è.
        </p>
      ) : (
        <ul className="voci-composizione">
          {composizione.map((voce) => {
            const componente = componenti.get(voce.componenteId)!;
            return (
              <li key={voce.componenteId}>
                <input
                  type="text"
                  inputMode="decimal"
                  className="quantita-composizione"
                  defaultValue={quantitaInTesto(voce.quantita)}
                  onBlur={(e) => cambiaQuantita(voce.componenteId, e.target.value, e.target)}
                  aria-label={`Quantità di ${componente.nome} in ${prodotto.nome}`}
                />
                <span className="nome-componente">{componente.nome}</span>
                <span className="settore-componente">{NOME_SETTORE[componente.settore]}</span>
                <button
                  type="button"
                  className="togli"
                  aria-label={`Togli ${componente.nome} da ${prodotto.nome}`}
                  onClick={() => salva(composizione.filter((v) => v.componenteId !== voce.componenteId))}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="aggiungi-componente">
        <input
          type="text"
          inputMode="decimal"
          className="quantita-composizione"
          value={nuovaQuantita}
          onChange={(e) => setNuovaQuantita(e.target.value)}
          aria-label={`Quantità del componente da aggiungere a ${prodotto.nome}`}
        />
        <select
          value={nuovoId}
          onChange={(e) => setNuovoId(e.target.value)}
          aria-label={`Componente da aggiungere a ${prodotto.nome}`}
        >
          <option value="">scegli un componente…</option>
          {[...componenti.values()].map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} ({NOME_SETTORE[c.settore]})
            </option>
          ))}
        </select>
        <button type="button" className="bottone-aggiungi" disabled={!nuovoId} onClick={aggiungi}>
          Aggiungi
        </button>
      </div>

      {errore && <p className="errore">{errore}</p>}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Scheda
// ---------------------------------------------------------------------------

export function Composizioni() {
  const componenti = useComponenti();
  const prodotti = useProdotti();
  const categorie = useCategorie();

  const mappaComponenti = useMemo(() => new Map(componenti.map((c) => [c.id, c])), [componenti]);

  /** Per ogni componente, i piatti che lo usano. */
  const usi = useMemo(() => {
    const perComponente = new Map<string, string[]>();
    for (const p of prodotti) {
      for (const voce of p.composizione ?? []) {
        perComponente.set(voce.componenteId, [...(perComponente.get(voce.componenteId) ?? []), p.nome]);
      }
    }
    return perComponente;
  }, [prodotti]);

  const gruppi = useMemo(
    () =>
      categorie
        .map((categoria) => ({ categoria, piatti: prodotti.filter((p) => p.categoriaId === categoria.id) }))
        .filter((g) => g.piatti.length > 0),
    [categorie, prodotti]
  );

  return (
    <div className="area composizioni">
      <section className="riquadro">
        <h2>Componenti</h2>
        <p className="spiegazione">
          Le parti che i settori preparano davvero: un pollo, una salsiccia, una porzione di patatine. Ogni
          componente dice chi lo prepara, così un piatto può dare lavoro a più settori insieme.
        </p>
        <div className="tabella-scroll">
          <table className="tabella-componenti">
            <thead>
              <tr>
                <th>Componente</th>
                <th>Settore</th>
                <th>Usato in</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {componenti.map((c) => (
                <RigaComponente key={c.id} componente={c} usatoIn={usi.get(c.id) ?? []} />
              ))}
              <NuovoComponente idPresi={new Set(componenti.map((c) => c.id))} />
            </tbody>
          </table>
        </div>
      </section>

      <section className="riquadro">
        <h2>Composizione dei piatti</h2>
        <p className="spiegazione">
          Per ogni piatto, quanto serve di ciascun componente. Le quantità possono essere frazionarie — scrivi 0,5
          oppure 1/2 per mezzo pollo. Quando arriva un ordine, ogni settore riceve solo i componenti che gli
          spettano, e sul suo schermo li trova già sommati. Un piatto senza composizione resta un pezzo unico,
          preparato dal settore scelto in Gestione menù.
        </p>

        {componenti.length === 0 && (
          <p className="vuoto">Crea prima qualche componente qui sopra, poi assegnalo ai piatti.</p>
        )}

        {gruppi.map(({ categoria, piatti }, indice) => (
          <div key={categoria.id} className="gruppo-composizioni">
            <div
              className="testata-portata"
              style={{ ['--portata-colore' as string]: `var(--portata-${(indice % 5) + 1})` }}
            >
              <span className="nome-portata">{categoria.nome}</span>
            </div>
            <div className="griglia-composizioni">
              {piatti.map((p) => (
                <ComposizionePiatto key={p.id} prodotto={p} componenti={mappaComponenti} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
