import { useEffect, useRef, useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { annullaOrdine, inviaOrdine, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';

/** L'ordine confermato in cassa: il numero è assegnato, il foglio è stampato,
 * le porzioni sono tenute da parte. Da qui si incassa e si invia, si ristampa
 * il foglio se la stampa è venuta male, o si annulla se il cliente rinuncia. */
export function SchedaDaIncassare({
  ordine,
  stampaSubito,
  onFatto,
  onMettiDaParte,
}: {
  ordine: Ordine;
  /** Vero appena dopo la conferma: il foglio per il cliente parte da solo. */
  stampaSubito?: boolean;
  onFatto: (messaggio: string) => void;
  onMettiDaParte?: () => void;
}) {
  const [inCorso, setInCorso] = useState<'invio' | 'annullo' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const giaStampato = useRef(false);

  useEffect(() => {
    if (!stampaSubito || giaStampato.current) return;
    giaStampato.current = true;
    stampa([{ tipo: 'resoconto', ordine }]);
  }, [stampaSubito, ordine]);

  async function incassa() {
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
    if (!window.confirm(`Annullare l'ordine ${ordine.codice}? Il cliente non ha pagato e le porzioni tornano libere.`))
      return;
    setErrore(null);
    setInCorso('annullo');
    try {
      await annullaOrdine({ serataId: SERATA_ID_OGGI, ordineId: ordine.id });
      onFatto(`Ordine ${ordine.codice} annullato: non è mai partito.`);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);

  return (
    <div className="scheda-incasso">
      <div className="testata-incasso">
        <span className="codice-comanda">{ordine.codice}</span>
        <span className="provenienza">
          Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'} coperti · {articoli}{' '}
          {articoli === 1 ? 'articolo' : 'articoli'}
        </span>
      </div>

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
        Da incassare <strong>{euro(ordine.totale)}</strong>
      </p>

      <p className="spiegazione">
        Il foglio con il numero {ordine.codice} è stampato: dallo al cliente, incassa e poi invia l'ordine ai
        reparti.
      </p>

      {errore && <p className="errore">{errore}</p>}

      <div className="bottoni-incasso">
        <button type="button" className="bottone-principale" disabled={inCorso !== null} onClick={incassa}>
          {inCorso === 'invio' ? 'Invio in corso…' : 'Incassato: invia'}
        </button>
        <button type="button" disabled={inCorso !== null} onClick={() => stampa([{ tipo: 'resoconto', ordine }])}>
          Ristampa foglio
        </button>
        <button type="button" className="bottone-annulla" disabled={inCorso !== null} onClick={annulla}>
          {inCorso === 'annullo' ? 'Annullamento…' : 'Annulla ordine'}
        </button>
        {onMettiDaParte && (
          <button type="button" className="bottone-secondario" disabled={inCorso !== null} onClick={onMettiDaParte}>
            Metti da parte
          </button>
        )}
      </div>
    </div>
  );
}

/** Tutti gli ordini confermati e non ancora incassati, di qualunque cassa: se
 * una cassiera stacca, un'altra può chiudere il suo ordine in sospeso. */
export function DaIncassare() {
  const ordini = useOrdiniAperti().filter((o) => o.stato === 'da_pagare');
  const [apertoId, setApertoId] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const aperto = ordini.find((o) => o.id === apertoId) ?? null;

  return (
    <div className="da-incassare">
      {aperto ? (
        <section className="riquadro">
          <h2>Ordine {aperto.codice}</h2>
          <SchedaDaIncassare
            ordine={aperto}
            onFatto={(testo) => {
              setMessaggio(testo);
              setApertoId(null);
            }}
            onMettiDaParte={() => setApertoId(null)}
          />
        </section>
      ) : (
        <section className="riquadro">
          <h2>
            In attesa di pagamento <span className="contatore">{ordini.length}</span>
          </h2>
          <p className="spiegazione">
            Ordini confermati con il numero già stampato, che aspettano l'incasso. Aprine uno per incassarlo,
            ristampare il foglio o annullarlo.
          </p>
          {messaggio && <p className="successo">{messaggio}</p>}
          {ordini.length === 0 ? (
            <p className="vuoto">Nessun ordine in attesa di pagamento.</p>
          ) : (
            <ul className="elenco-bozze">
              {ordini.map((o) => {
                const articoli = o.items.reduce((somma, item) => somma + item.quantita, 0);
                return (
                  <li key={o.id}>
                    <span className="numero">{o.codice}</span>
                    <span className="dettagli">
                      <span>
                        Tavolo {o.tavolo ?? '—'} · {articoli} {articoli === 1 ? 'articolo' : 'articoli'}
                      </span>
                      <span className="voci">{o.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</span>
                    </span>
                    <span className="prezzo">{euro(o.totale)}</span>
                    <button type="button" onClick={() => setApertoId(o.id)}>
                      Apri
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
