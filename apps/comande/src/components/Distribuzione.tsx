import { useEffect, useRef, useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { chiudiOrdine, messaggioErrore, segnaCopiaCucinaStampata } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';

interface Esito {
  tipo: 'ok' | 'errore';
  testo: string;
}

/** La postazione dove esce la copia cucina, si compongono i vassoi e si legge
 * il codice a barre prima di portarli al tavolo. */
export function Distribuzione() {
  const inLavorazione = useOrdiniAperti().filter((o) => o.stato === 'in_evasione');
  const [esito, setEsito] = useState<Esito | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [codice, setCodice] = useState('');
  const casella = useRef<HTMLInputElement>(null);
  // Ordini per cui la stampa è già stata chiesta al server in questa pagina:
  // senza questo l'elenco, che si aggiorna in tempo reale, richiederebbe la
  // stessa stampa a ogni aggiornamento.
  const richieste = useRef(new Set<string>());

  // Stampa automatica: appena un ordine incassato arriva, la Distribuzione si
  // prende la sua copia cucina e la manda in stampa. Il server la assegna a
  // uno solo, quindi non escono doppioni.
  useEffect(() => {
    for (const ordine of inLavorazione) {
      if (ordine.copiaCucinaStampataAt || richieste.current.has(ordine.id)) continue;
      richieste.current.add(ordine.id);
      segnaCopiaCucinaStampata({ serataId: SERATA_ID_OGGI, ordineId: ordine.id })
        .then((risposta) => {
          if (risposta.data.daStampare) stampa([{ tipo: 'copiaCucina', ordine }]);
        })
        .catch((err) => setEsito({ tipo: 'errore', testo: messaggioErrore(err) }));
    }
  }, [inLavorazione]);

  /** Chiude l'ordine a cui appartiene il codice a barre. È l'unica strada:
   * che il codice arrivi dal lettore o dal tasto provvisorio qui sotto, il
   * server riceve e controlla sempre la stessa cosa. */
  async function chiudiConCodice(letto: string) {
    if (!letto || inCorso) return;
    setInCorso(true);
    setEsito(null);
    try {
      const risposta = await chiudiOrdine({ serataId: SERATA_ID_OGGI, codiceBarre: letto });
      setEsito({
        tipo: 'ok',
        testo: `${risposta.data.codice} consegnato — tavolo ${risposta.data.tavolo ?? '—'}`,
      });
    } catch (err) {
      setEsito({ tipo: 'errore', testo: messaggioErrore(err) });
    } finally {
      setCodice('');
      setInCorso(false);
      casella.current?.focus();
    }
  }

  /** Il lettore di codici a barre si comporta come una tastiera: scrive il
   * codice nella casella e preme Invio. La casella resta sempre pronta, così
   * chi lavora non deve cliccare da nessuna parte. */
  function leggi(e: React.FormEvent) {
    e.preventDefault();
    void chiudiConCodice(codice.trim());
  }

  return (
    <div className="distribuzione">
      <section className="riquadro lettura-codice">
        <h2>Lettura del codice a barre</h2>
        <form onSubmit={leggi}>
          <label>
            Passa la copia cucina sotto il lettore
            <input
              ref={casella}
              type="text"
              value={codice}
              onChange={(e) => setCodice(e.target.value)}
              // Il lettore scrive tutto in un istante: niente correzioni
              // automatiche, niente maiuscole aggiunte dal telefono.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus
              placeholder="A0001202609172130A"
              disabled={inCorso}
            />
          </label>
          <button type="submit" className="bottone-principale" disabled={inCorso || !codice.trim()}>
            {inCorso ? 'Controllo…' : 'Chiudi l’ordine'}
          </button>
        </form>
        <p className="spiegazione">
          Se il lettore non legge, il codice si può scrivere a mano e premere Invio. La lettura chiude tutto
          l'ordine e fa scendere i numeri sugli schermi dei reparti.
        </p>
        {esito && <p className={esito.tipo === 'ok' ? 'esito-ok' : 'esito-errore'}>{esito.testo}</p>}
      </section>

      <section className="riquadro">
        <h2>
          Vassoi da comporre <span className="contatore">{inLavorazione.length}</span>
        </h2>
        <p className="spiegazione">
          Ordini pagati e non ancora consegnati. La copia cucina esce da sola appena l'ordine arriva; se la stampa
          si inceppa, usa Ristampa.
        </p>
        {/* PROVVISORIO — da togliere insieme al tasto "Consegnato". */}
        <p className="spiegazione avviso-provvisorio">
          Il tasto <strong>Consegnato</strong> serve solo finché non c'è il lettore di codici a barre: chiude
          l'ordine come se il codice fosse stato letto. Con il lettore in mano, si toglie.
        </p>
        {inLavorazione.length === 0 ? (
          <p className="vuoto">Nessun ordine in lavorazione.</p>
        ) : (
          <ul className="elenco-vassoi">
            {inLavorazione.map((ordine) => (
              <RigaVassoio
                key={ordine.id}
                ordine={ordine}
                inCorso={inCorso}
                onConsegnato={() => chiudiConCodice(ordine.codiceBarre ?? '')}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RigaVassoio({
  ordine,
  inCorso,
  onConsegnato,
}: {
  ordine: Ordine;
  inCorso: boolean;
  onConsegnato: () => void;
}) {
  return (
    <li>
      <span className="numero">{ordine.codice ?? `n. ${ordine.numero}`}</span>
      <span className="dettagli">
        <span>
          Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'} coperti
        </span>
        <span className="voci">{ordine.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</span>
      </span>
      <button type="button" onClick={() => stampa([{ tipo: 'copiaCucina', ordine }])}>
        Ristampa
      </button>
      {/* PROVVISORIO — da togliere quando arriva il lettore di codici a barre.
          Manda al server lo stesso codice che leggerebbe lo scanner, così il
          giro provato è quello vero e non una scorciatoia. */}
      <button
        type="button"
        className="bottone-provvisorio"
        disabled={inCorso || !ordine.codiceBarre}
        title="Chiude l'ordine come se il codice a barre fosse stato letto"
        onClick={onConsegnato}
      >
        Consegnato
      </button>
    </li>
  );
}
