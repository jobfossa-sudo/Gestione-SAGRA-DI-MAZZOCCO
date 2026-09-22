import { useState } from 'react';
import type { Ordine, StatoOrdine, TipoOrdine } from '@sagra-mazzocco/shared';
import { useOrdiniSerata } from '../hooks';
import { annullaOrdine, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';

/** Lo stato detto come lo direbbe chi sta in cassa, non come si chiama in
 * archivio. "da_pagare" non lo produce più nessuno: resta perché gli ordini
 * fatti prima del cambio ce l'hanno ancora addosso. */
const NOME_STATO: Record<StatoOrdine, string> = {
  bozza: 'dal tavolo, non ancora incassato',
  da_pagare: 'confermato e mai incassato',
  confermata_pagata: 'pagato',
  in_evasione: 'in preparazione',
  completata: 'consegnato',
  annullata: 'annullato',
};

/** Il colore della targhetta: quello che è finito bene si spegne, quello che
 * chiede attenzione si accende. */
const TONO_STATO: Record<StatoOrdine, string> = {
  bozza: 'attesa',
  da_pagare: 'attesa',
  confermata_pagata: 'corso',
  in_evasione: 'corso',
  completata: 'fatto',
  annullata: 'annullato',
};

function oraDi(ordine: Ordine): string {
  const orario = ordine.confirmedAt ?? ordine.createdAt;
  if (!orario) return '—';
  return new Date(orario.seconds * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function RigaOrdine({ ordine }: { ordine: Ordine }) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Un ordine già consegnato o già annullato non si tocca più: il cibo è al
  // tavolo, oppure le porzioni sono già tornate vendibili.
  const annullabile = ordine.stato !== 'completata' && ordine.stato !== 'annullata';
  // Senza numero di comanda non c'è un foglio da ristampare: una bozza dal
  // tavolo il suo foglio non l'ha mai avuto.
  const ristampabile = Boolean(ordine.codice);

  async function annulla() {
    const nome = ordine.codice ?? `n. ${ordine.numero}`;
    if (!window.confirm(`Annullare l'ordine ${nome} (${euro(ordine.totale)})? Le porzioni tornano vendibili.`)) return;
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
    <li className={`riga-riepilogo stato-${TONO_STATO[ordine.stato]}`}>
      <div className="sommario-ordine">
        <span className="numero">{ordine.codice ?? `n. ${ordine.numero}`}</span>
        <span className="dettagli">
          <span>
            Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'}{' '}
            {ordine.coperti === 1 ? 'coperto' : 'coperti'} · {articoli}{' '}
            {articoli === 1 ? 'articolo' : 'articoli'} · {oraDi(ordine)}
          </span>
          <span className={`targhetta-stato ${TONO_STATO[ordine.stato]}`}>{NOME_STATO[ordine.stato]}</span>
        </span>
        <span className="prezzo">{euro(ordine.totale)}</span>
        <span className="azioni-riga">
          <button type="button" onClick={() => setAperto((prec) => !prec)}>
            {aperto ? 'Chiudi' : 'Vedi'}
          </button>
          {ristampabile && (
            <button type="button" onClick={() => stampa([{ tipo: 'resoconto', ordine }])}>
              Ristampa
            </button>
          )}
          {annullabile && (
            <button type="button" className="bottone-annulla" disabled={inCorso} onClick={annulla}>
              {inCorso ? 'Annullamento…' : 'Annulla'}
            </button>
          )}
        </span>
      </div>

      {errore && <p className="errore">{errore}</p>}

      {aperto && (
        <ul className="voci-riepilogo">
          {ordine.items.map((item) => (
            <li key={item.prodottoId}>
              <span className="quantita">{item.quantita}×</span>
              <span className="voce">{item.nome}</span>
              <span className="prezzo">{euro(item.prezzo * item.quantita)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Il riepilogo della serata, uno per provenienza: da una parte gli ordini
 * battuti al banco, dall'altra quelli arrivati dal QR dei tavoli. Si guarda,
 * si ristampa un foglio perso, si annulla uno sbagliato. Non si lavora da qui:
 * il lavoro della cassa sta tutto in "Nuovo ordine". */
export function Ordini({ tipo }: { tipo: TipoOrdine }) {
  const ordini = useOrdiniSerata().filter((o) => o.tipo === tipo);
  const vivi = ordini.filter((o) => o.stato !== 'annullata');
  const incasso = ordini
    .filter((o) => o.stato === 'in_evasione' || o.stato === 'completata' || o.stato === 'confermata_pagata')
    .reduce((somma, o) => somma + o.totale, 0);

  return (
    <div className="riepilogo-ordini">
      <section className="riquadro">
        <h2>
          {tipo === 'cassa' ? 'Ordini battuti al banco' : 'Ordini arrivati dal QR dei tavoli'}{' '}
          <span className="contatore">{vivi.length}</span>
        </h2>
        <p className="spiegazione">
          {tipo === 'cassa'
            ? 'Tutti gli ordini presi in cassa stasera, dal più recente. Gli annullati restano in elenco.'
            : 'Tutti gli ordini inviati dai clienti col telefono. Quelli ancora da incassare si richiamano dalla scheda Nuovo ordine, scrivendo il loro numero.'}{' '}
          Incassato finora: <strong>{euro(incasso)}</strong>.
        </p>
        {ordini.length === 0 ? (
          <p className="vuoto">Nessun ordine di questo tipo, per ora.</p>
        ) : (
          <ul className="elenco-riepilogo">
            {ordini.map((ordine) => (
              <RigaOrdine key={ordine.id} ordine={ordine} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
