import { useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { annullaOrdine, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

function RigaOrdine({ ordine }: { ordine: Ordine }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function handleAnnulla() {
    if (!window.confirm(`Annullare l'ordine n. ${ordine.numero} (€ ${ordine.totale.toFixed(2)})?`)) return;
    setErrore(null);
    setInCorso(true);
    try {
      await annullaOrdine({ serataId: SERATA_ID_OGGI, ordineId: ordine.id });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <li className="riga-ordine-aperto">
      <span>
        n. {ordine.numero} — {ordine.tipo === 'qr' ? `tavolo ${ordine.tavolo}` : 'cassa'} — € {ordine.totale.toFixed(2)}
      </span>
      <button type="button" onClick={handleAnnulla} disabled={inCorso}>
        {inCorso ? 'Annullamento…' : 'Annulla'}
      </button>
      {errore && <p className="errore">{errore}</p>}
    </li>
  );
}

export function FineSerata() {
  const ordini = useOrdiniAperti();
  const bozze = ordini.filter((o) => o.stato === 'bozza');
  const inEvasione = ordini.filter((o) => o.stato === 'in_evasione');

  return (
    <div className="fine-serata">
      <section>
        <h2>Bozze mai confermate ({bozze.length})</h2>
        {bozze.length === 0 && <p>Nessuna.</p>}
        <ul>
          {bozze.map((o) => (
            <RigaOrdine key={o.id} ordine={o} />
          ))}
        </ul>
      </section>
      <section>
        <h2>Ordini pagati mai completati ({inEvasione.length})</h2>
        {inEvasione.length === 0 && <p>Nessuno.</p>}
        <ul>
          {inEvasione.map((o) => (
            <RigaOrdine key={o.id} ordine={o} />
          ))}
        </ul>
      </section>
    </div>
  );
}
