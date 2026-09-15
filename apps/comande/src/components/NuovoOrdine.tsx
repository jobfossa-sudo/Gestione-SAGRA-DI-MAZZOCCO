import { useMemo, useState } from 'react';
import type { Reparto } from '@sagra-mazzocco/shared';
import { useProdottiDisponibili } from '../hooks';
import { creaOrdineCassa, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

const NOME_REPARTO: Record<Reparto, string> = { cucina: 'Cucina', bevande: 'Bevande' };

export function NuovoOrdine() {
  const prodotti = useProdottiDisponibili();
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [tavolo, setTavolo] = useState('');
  const [coperti, setCoperti] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

  const prodottiPerReparto = useMemo(() => {
    const gruppi = new Map<Reparto, typeof prodotti>();
    for (const prodotto of prodotti) {
      const lista = gruppi.get(prodotto.reparto) ?? [];
      lista.push(prodotto);
      gruppi.set(prodotto.reparto, lista);
    }
    return gruppi;
  }, [prodotti]);

  const totale = useMemo(
    () => prodotti.reduce((somma, p) => somma + p.prezzo * (carrello[p.id] ?? 0), 0),
    [prodotti, carrello]
  );

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
      setMessaggioSuccesso(`Ordine n. ${risultato.data.numero} creato — totale € ${risultato.data.totale.toFixed(2)}`);
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
        {[...prodottiPerReparto.entries()].map(([reparto, lista]) => (
          <div key={reparto} className="gruppo-reparto">
            <h2>{NOME_REPARTO[reparto]}</h2>
            {lista.map((prodotto) => (
              <div key={prodotto.id} className="riga-prodotto">
                <span className="nome-prodotto">
                  {prodotto.nome} <small>€ {prodotto.prezzo.toFixed(2)}</small>
                </span>
                <div className="controlli-quantita">
                  <button type="button" onClick={() => cambiaQuantita(prodotto.id, -1)}>
                    −
                  </button>
                  <span>{carrello[prodotto.id] ?? 0}</span>
                  <button type="button" onClick={() => cambiaQuantita(prodotto.id, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
        {prodotti.length === 0 && <p>Nessun prodotto disponibile.</p>}
      </div>

      <div className="colonna-riepilogo">
        <h2>Ordine</h2>
        <label>
          Tavolo (opzionale)
          <input type="number" min="1" value={tavolo} onChange={(e) => setTavolo(e.target.value)} />
        </label>
        <label>
          Coperti (opzionale)
          <input type="number" min="1" value={coperti} onChange={(e) => setCoperti(e.target.value)} />
        </label>
        <p className="totale">Totale: € {totale.toFixed(2)}</p>
        {errore && <p className="errore">{errore}</p>}
        {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}
        <button type="button" disabled={numeroArticoli === 0 || inCorso} onClick={inviaOrdine}>
          {inCorso ? 'Invio in corso…' : 'Conferma e invia'}
        </button>
      </div>
    </div>
  );
}
