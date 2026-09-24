import type { Ordine } from '@sagra-mazzocco/shared';
import { euro } from '../services/formato';

/** Il conto come si guarda a schermo insieme al cliente, mentre lo si batte.
 *
 * Non è il foglio che esce dalla stampante: quello lo compone l'amministratore
 * nella scheda "Biglietti" e lo disegna FoglioComposto, con le sue misure in
 * millimetri. Qui ci sono le stesse voci vestite come il resto dell'app —
 * scritte grandi, colori dell'app, tema scuro compreso.
 *
 * Prima al suo posto c'era la fotografia in scala del foglio A5: fedele alla
 * carta e, rimpicciolita per stare nella colonna, illeggibile da dietro il
 * banco. Chi vuole vedere com'è impaginata la carta ha l'anteprima vera nella
 * scheda "Biglietti"; qui serve leggere, non controllare i margini. */
export function ResocontoCliente({
  ordine,
  nota,
}: {
  ordine: Ordine;
  /** Una riga sotto il titolo, quando c'è qualcosa da spiegare. */
  nota?: string;
}) {
  const pezzi = ordine.items.reduce((somma, voce) => somma + voce.quantita, 0);

  return (
    <section className="riquadro resoconto-cliente">
      <div className="testa-resoconto">
        <div>
          <h2>Resoconto</h2>
          {nota && <p className="spiegazione">{nota}</p>}
        </div>
        {/* Tavolo e coperti stanno in alto a destra, grandi: sono la prima cosa
            che si ricontrolla prima di confermare, e senza di loro l'ordine non
            parte. Finché mancano restano due caselle vuote, non spariscono: il
            posto vuoto si nota, l'assenza no. */}
        <div className="targhette-resoconto">
          <span className="targhetta-resoconto">
            <small>Tavolo</small>
            <strong>{ordine.tavolo ?? '—'}</strong>
          </span>
          <span className="targhetta-resoconto">
            <small>Coperti</small>
            <strong>{ordine.coperti ?? '—'}</strong>
          </span>
        </div>
      </div>

      {ordine.items.length === 0 ? (
        <p className="vuoto vuoto-resoconto">Nessun piatto ancora — comincia dal menù qui a fianco.</p>
      ) : (
        /* L'elenco scorre dentro di sé quando l'ordine è lungo: il totale e i
           tasti sotto restano al loro posto invece di finire fuori schermo. */
        <ul className="voci-resoconto">
          {ordine.items.map((voce) => (
            <li key={voce.prodottoId}>
              <span className="quantita-resoconto">{voce.quantita}×</span>
              <span className="nome-resoconto">{voce.nome}</span>
              <span className="prezzo-resoconto">{euro(voce.prezzo * voce.quantita)}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Il totale in fascia gialla, come l'incasso in Fine serata: è la cifra
          che si dice ad alta voce al cliente, e non dev'essere una riga come
          le altre. */}
      <div className="totale-resoconto">
        <span className="pezzi-resoconto">
          {pezzi === 0 ? 'nessun pezzo' : pezzi === 1 ? '1 pezzo' : `${pezzi} pezzi`}
        </span>
        <span className="etichetta-totale-resoconto">Totale</span>
        <strong className="cifra-totale-resoconto">{euro(ordine.totale)}</strong>
      </div>
    </section>
  );
}
