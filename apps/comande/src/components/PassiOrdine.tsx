import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { annullaOrdine, confermaOrdine, inviaOrdine, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';

/** Le voci dell'ordine con il totale: si fanno controllare al cliente prima di
 * confermare e restano sotto gli occhi mentre paga. */
export function VociOrdine({ ordine, etichettaTotale }: { ordine: Ordine; etichettaTotale: string }) {
  return (
    <>
      <ul className="voci-resoconto">
        {ordine.items.map((item) => (
          <li key={item.prodottoId}>
            <span className="quantita">{item.quantita}×</span>
            <span className="voce">{item.nome}</span>
            <span className="prezzo">{euro(item.prezzo * item.quantita)}</span>
          </li>
        ))}
      </ul>
      <p className="totale">
        {etichettaTotale} <strong>{euro(ordine.totale)}</strong>
      </p>
    </>
  );
}

/** Intestazione dell'ordine aperto: il numero grande è quello che la cassiera
 * dice ad alta voce, il resto serve a riconoscere il tavolo giusto. */
export function TestataOrdine({ ordine }: { ordine: Ordine }) {
  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);
  const daPagare = ordine.stato === 'da_pagare';

  return (
    <div className="testata-ordine">
      <span className={daPagare ? 'codice-comanda' : 'numero-ordine'}>
        {daPagare ? ordine.codice : `n. ${ordine.numero}`}
      </span>
      <span className="provenienza">
        Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'} coperti · {articoli}{' '}
        {articoli === 1 ? 'articolo' : 'articoli'}
      </span>
    </div>
  );
}

/** Un gradino della scala: i due passi restano sempre tutti e due sotto gli
 * occhi, così si vede a colpo d'occhio a che punto è l'ordine. Quello già
 * fatto porta la spunta ed è spento, quello da fare è acceso. */
export function Passo({ numero, stato, children }: { numero: number; stato: 'fatto' | 'ora' | 'dopo'; children: ReactNode }) {
  return (
    <div className={`passo passo-${stato}`}>
      <span className="segno-passo" aria-hidden="true">
        {stato === 'fatto' ? '✓' : numero}
      </span>
      <div className="corpo-passo">{children}</div>
    </div>
  );
}

/** La scala dei due passi per un ordine arrivato dal tavolo: ① lo conferma,
 * gli dà il numero di comanda e stampa il foglio; ② lo incassa e lo manda ai
 * reparti. Sotto, le azioni di servizio (ristampa e annullamento), che
 * esistono solo quando c'è qualcosa di stampato da ristampare. */
export function PassiOrdine({
  ordine,
  /** Vero appena dopo la conferma fatta qui: il foglio del cliente parte da solo. */
  stampaSubito,
  onFatto,
  onChiudi,
  etichettaChiudi = 'Torna indietro',
}: {
  ordine: Ordine;
  stampaSubito?: boolean;
  onFatto: (messaggio: string) => void;
  onChiudi?: () => void;
  etichettaChiudi?: string;
}) {
  const daPagare = ordine.stato === 'da_pagare';
  const [inCorso, setInCorso] = useState<'conferma' | 'invio' | 'annullo' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  /** "Appena questo ordine risulta confermato, stampa il foglio" — e una volta
   * sola: senza, ogni ridisegno della pagina sparerebbe un altro foglio. Vale
   * dopo una conferma fatta qui, oppure se chi ci usa dice che la conferma è
   * appena avvenuta altrove (il carrello del Nuovo ordine). Riaprendo invece
   * un ordine già in attesa di pagamento non si stampa niente. */
  const daStampare = useRef(Boolean(stampaSubito));

  useEffect(() => {
    if (!daPagare || !daStampare.current) return;
    daStampare.current = false;
    stampa([{ tipo: 'resoconto', ordine }]);
  }, [daPagare, ordine]);

  async function conferma() {
    setErrore(null);
    setInCorso('conferma');
    try {
      // Il foglio parte da solo: la conferma arriva come cambio di stato
      // dell'ordine, e a quel punto l'effetto qui sopra stampa.
      daStampare.current = true;
      await confermaOrdine({ serataId: SERATA_ID_OGGI, numero: ordine.numero });
    } catch (err) {
      // Qui finiscono anche i piatti esauriti tra l'invio dal tavolo e la
      // cassa: il messaggio arriva dal server ed è già in italiano.
      daStampare.current = false;
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  async function invia() {
    setErrore(null);
    setInCorso('invio');
    try {
      await inviaOrdine({ serataId: SERATA_ID_OGGI, ordineId: ordine.id });
      onFatto(`Ordine ${ordine.codice} incassato e inviato ai reparti — ${euro(ordine.totale)}`);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  async function annulla() {
    const nome = ordine.codice ?? `n. ${ordine.numero}`;
    if (!window.confirm(`Annullare l'ordine ${nome}? Il cliente non ha pagato e le porzioni tornano libere.`)) return;
    setErrore(null);
    setInCorso('annullo');
    try {
      await annullaOrdine({ serataId: SERATA_ID_OGGI, ordineId: ordine.id });
      onFatto(`Ordine ${nome} annullato: non è mai partito.`);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  const occupato = inCorso !== null;

  return (
    <>
      {errore && <p className="errore">{errore}</p>}

      <div className="passi-ordine">
        <Passo numero={1} stato={daPagare ? 'fatto' : 'ora'}>
          <button type="button" className="bottone-principale" disabled={daPagare || occupato} onClick={conferma}>
            {inCorso === 'conferma'
              ? 'Conferma in corso…'
              : daPagare
                ? 'Confermato e stampato'
                : 'Conferma e stampa'}
          </button>
          <p className="spiegazione">
            {daPagare
              ? `Foglio n. ${ordine.codice} stampato, porzioni tenute da parte.`
              : 'Fai controllare l’ordine al cliente: la conferma gli dà il numero di comanda e stampa il foglio da pagare.'}
          </p>
        </Passo>

        <Passo numero={2} stato={daPagare ? 'ora' : 'dopo'}>
          <button type="button" className="bottone-principale" disabled={!daPagare || occupato} onClick={invia}>
            {inCorso === 'invio' ? 'Invio in corso…' : 'Invia ordine'}
          </button>
          <p className="spiegazione">
            {daPagare
              ? 'Il cliente ha pagato: manda l’ordine ai reparti.'
              : 'Si accende dopo la conferma, quando il cliente ha pagato.'}
          </p>
        </Passo>
      </div>

      <div className="azioni-minori">
        {daPagare && (
          <>
            <button type="button" disabled={occupato} onClick={() => stampa([{ tipo: 'resoconto', ordine }])}>
              Ristampa foglio
            </button>
            <button type="button" className="bottone-annulla" disabled={occupato} onClick={annulla}>
              {inCorso === 'annullo' ? 'Annullamento…' : 'Annulla ordine'}
            </button>
          </>
        )}
        {onChiudi && (
          <button type="button" className="bottone-secondario" disabled={occupato} onClick={onChiudi}>
            {etichettaChiudi}
          </button>
        )}
      </div>
    </>
  );
}
