import { useState } from 'react';
import { NOME_BAGNO, millisecondiTimestamp, type SegnalazioneBagno } from '@sagra-mazzocco/shared';
import { useSegnalazioniAperte } from '../hooks';
import { messaggioErrore, prendiSegnalazione } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

/** Le segnalazioni arrivate dai bagni, in alto a destra sopra qualsiasi
 * schermata.
 *
 * Due modi di farle sparire, e fanno cose diverse:
 * - la ✕ la toglie solo da QUESTO schermo, per chi sta battendo ordini e non
 *   può muoversi;
 * - "Ci penso io" la toglie da TUTTI gli schermi, perché qualcuno ci sta
 *   andando e non ha senso che partano in due.
 *
 * Chiudere con la ✕ non risolve niente e non lo nasconde a nessun altro: è
 * l'unico modo onesto di togliersi di mezzo un avviso senza mentire agli
 * altri. */
function oraDi(segnalazione: SegnalazioneBagno): string {
  if (!segnalazione.createdAt) return 'ora';
  return new Date(millisecondiTimestamp(segnalazione.createdAt)).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AvvisoBagni() {
  const segnalazioni = useSegnalazioniAperte();
  /** Quelle chiuse con la ✕ su questo schermo. Vive finché vive la pagina:
   * ricaricando tornano, ed è giusto — se nessuno ci è andato, il problema
   * c'è ancora. */
  const [chiuse, setChiuse] = useState<string[]>([]);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const daMostrare = segnalazioni.filter((s) => !chiuse.includes(s.id));
  if (daMostrare.length === 0) return null;

  async function ciPensoIo(segnalazione: SegnalazioneBagno) {
    setErrore(null);
    setInCorso(segnalazione.id);
    try {
      await prendiSegnalazione({ serataId: SERATA_ID_OGGI, segnalazioneId: segnalazione.id });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="avvisi-bagni" role="status" aria-live="polite">
      {daMostrare.map((segnalazione) => (
        <article key={segnalazione.id} className="avviso-bagno">
          <div className="testata-avviso">
            <span className="luogo-avviso">Bagno {NOME_BAGNO[segnalazione.bagno]}</span>
            <span className="ora-avviso">{oraDi(segnalazione)}</span>
            <button
              type="button"
              className="chiudi-avviso"
              aria-label="Togli questo avviso dal mio schermo"
              title="Toglilo solo da questo schermo"
              onClick={() => setChiuse((prec) => [...prec, segnalazione.id])}
            >
              ✕
            </button>
          </div>
          <p className="testo-avviso">{segnalazione.testo}</p>
          <button
            type="button"
            className="bottone-principale"
            disabled={inCorso === segnalazione.id}
            onClick={() => ciPensoIo(segnalazione)}
          >
            {inCorso === segnalazione.id ? 'Un attimo…' : 'Ci penso io'}
          </button>
          {errore && <p className="errore">{errore}</p>}
        </article>
      ))}
    </div>
  );
}
