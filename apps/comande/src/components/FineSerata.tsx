import { useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { annullaOrdine, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';

function RigaOrdine({
  ordine,
  amministratore,
  puoAnnullare,
}: {
  ordine: Ordine;
  amministratore: boolean;
  /** La cassa annulla solo gli ordini non ancora incassati; il resto è
   * dell'amministratore, come nelle regole del server. */
  puoAnnullare?: boolean;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function handleAnnulla() {
    if (!window.confirm(`Annullare l'ordine ${ordine.codice ?? `n. ${ordine.numero}`} (${euro(ordine.totale)})?`)) return;
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

  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);

  return (
    <li className="riga-ordine-aperto">
      <span className="numero">{ordine.codice ?? `n. ${ordine.numero}`}</span>
      <span className="dettagli">
        <span>
          {ordine.tipo === 'qr' ? `Tavolo ${ordine.tavolo}` : 'Cassa'} · {articoli} articoli
        </span>
        <span>{euro(ordine.totale)}</span>
      </span>
      {(amministratore || puoAnnullare) && (
        <button type="button" className="bottone-annulla" onClick={handleAnnulla} disabled={inCorso}>
          {inCorso ? 'Annullamento…' : 'Annulla'}
        </button>
      )}
      {errore && <p className="errore">{errore}</p>}
    </li>
  );
}

export function FineSerata({ amministratore }: { amministratore: boolean }) {
  const ordini = useOrdiniAperti();
  const bozze = ordini.filter((o) => o.stato === 'bozza');
  const daPagare = ordini.filter((o) => o.stato === 'da_pagare');
  const inEvasione = ordini.filter((o) => o.stato === 'in_evasione');

  return (
    <div className="fine-serata">
      <section>
        <h2>
          Confermati e non incassati <span className="contatore">{daPagare.length}</span>
        </h2>
        <p className="spiegazione">
          Ordini con il numero già stampato che nessuno ha pagato: annullandoli le porzioni tornano libere.
        </p>
        {daPagare.length === 0 ? (
          <p className="vuoto">Nessun ordine in attesa di pagamento.</p>
        ) : (
          <ul>
            {daPagare.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} puoAnnullare />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>
          Bozze mai confermate <span className="contatore">{bozze.length}</span>
        </h2>
        <p className="spiegazione">Ordini inviati dal tavolo ma mai passati in cassa: non sono mai partiti.</p>
        {bozze.length === 0 ? (
          <p className="vuoto">Nessuna bozza in sospeso.</p>
        ) : (
          <ul>
            {bozze.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>
          Ordini pagati non completati <span className="contatore">{inEvasione.length}</span>
        </h2>
        <p className="spiegazione">Ordini pagati e inviati ai reparti, ma non ancora consegnati del tutto.</p>
        {inEvasione.length === 0 ? (
          <p className="vuoto">Nessun ordine in sospeso.</p>
        ) : (
          <ul>
            {inEvasione.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
