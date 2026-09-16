import { useMemo, useState } from 'react';
import type { Reparto } from '@sagra-mazzocco/shared';
import { useProdotti } from '../hooks';
import { creaOrdineCassa, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

const NOME_REPARTO: Record<Reparto, string> = { cucina: 'Cucina', bevande: 'Bevande' };
const ORDINE_REPARTI: Reparto[] = ['cucina', 'bevande'];

function euro(valore: number): string {
  return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

export function NuovoOrdine() {
  const tuttiIProdotti = useProdotti();
  // I piatti finiti restano visibili ma non ordinabili: se ne occupa il C3.
  const prodotti = tuttiIProdotti.filter((p) => p.esauritoSerata !== SERATA_ID_OGGI);
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [tavolo, setTavolo] = useState('');
  const [coperti, setCoperti] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

  const prodottiPerReparto = useMemo(
    () =>
      ORDINE_REPARTI.map((reparto) => ({
        reparto,
        lista: prodotti
          .filter((p) => p.reparto === reparto)
          .sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
      })).filter((gruppo) => gruppo.lista.length > 0),
    [prodotti]
  );

  const selezionati = useMemo(
    () => prodotti.filter((p) => (carrello[p.id] ?? 0) > 0),
    [prodotti, carrello]
  );

  const totale = selezionati.reduce((somma, p) => somma + p.prezzo * carrello[p.id], 0);
  const numeroArticoli = Object.values(carrello).reduce((s, q) => s + q, 0);

  function cambiaQuantita(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  async function inviaOrdine() {
    setErrore(null);
    setMessaggioSuccesso(null);
    setInCorso(true);
    try {
      const items = Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita }));
      const risultato = await creaOrdineCassa({
        serataId: SERATA_ID_OGGI,
        items,
        tavolo: tavolo ? Number(tavolo) : null,
        coperti: coperti ? Number(coperti) : null,
      });
      setMessaggioSuccesso(
        `Ordine n. ${risultato.data.numero} inviato ai reparti — ${euro(risultato.data.totale)}`
      );
      setCarrello({});
      setTavolo('');
      setCoperti('');
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="nuovo-ordine">
      <div className="colonna-menu">
        {prodottiPerReparto.map(({ reparto, lista }) => (
          <div key={reparto} className="gruppo-reparto">
            <div className="intestazione-reparto">
              <span className="pallino" style={{ ['--reparto-colore' as string]: `var(--${reparto})` }} />
              <h2>{NOME_REPARTO[reparto]}</h2>
            </div>
            <div className="griglia-prodotti">
              {lista.map((prodotto) => {
                const quantita = carrello[prodotto.id] ?? 0;
                return (
                  <div key={prodotto.id} className={`riga-prodotto${quantita > 0 ? ' selezionato' : ''}`}>
                    <span className="nome-prodotto">
                      {prodotto.nome}
                      <small>{euro(prodotto.prezzo)}</small>
                    </span>
                    <div className="controlli-quantita">
                      <button
                        type="button"
                        aria-label={`Togli ${prodotto.nome}`}
                        disabled={quantita === 0}
                        onClick={() => cambiaQuantita(prodotto.id, -1)}
                      >
                        −
                      </button>
                      <span>{quantita}</span>
                      <button
                        type="button"
                        aria-label={`Aggiungi ${prodotto.nome}`}
                        onClick={() => cambiaQuantita(prodotto.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {prodotti.length === 0 && <p className="vuoto">Nessun prodotto disponibile.</p>}
      </div>

      <div className="colonna-riepilogo">
        <h2>Riepilogo ordine</h2>

        {selezionati.length === 0 ? (
          <p className="carrello-vuoto">Tocca i prodotti per aggiungerli all'ordine.</p>
        ) : (
          <ul className="carrello">
            {selezionati.map((p) => (
              <li key={p.id}>
                <span>
                  <span className="quantita">{carrello[p.id]}×</span>
                  {p.nome}
                </span>
                <span className="prezzo">{euro(p.prezzo * carrello[p.id])}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="campi-tavolo">
          <label>
            Tavolo
            <input type="number" min="1" placeholder="—" value={tavolo} onChange={(e) => setTavolo(e.target.value)} />
          </label>
          <label>
            Coperti
            <input type="number" min="1" placeholder="—" value={coperti} onChange={(e) => setCoperti(e.target.value)} />
          </label>
        </div>

        <p className="totale">
          Totale <strong>{euro(totale)}</strong>
        </p>

        {errore && <p className="errore">{errore}</p>}
        {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}

        <button
          type="button"
          className="bottone-principale"
          disabled={numeroArticoli === 0 || inCorso}
          onClick={inviaOrdine}
        >
          {inCorso ? 'Invio in corso…' : 'Conferma e invia'}
        </button>
      </div>
    </div>
  );
}
