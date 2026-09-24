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
 * scheda "Biglietti"; qui serve leggere, non controllare i margini.
 *
 * Lo usano la cassa dei tavoli e i banchi (BAR, BEVANDE). Per questo prende le
 * voci e il totale invece di un ordine intero: un ordine del banco non ha
 * tavolo né coperti, e un conto a metà non si stampa nella forma dell'altro. */

/** Il minimo che serve per scrivere una riga del conto: ci stanno dentro sia
 * le voci di un ordine dei tavoli sia quelle di un banco. */
export interface VoceResoconto {
  prodottoId: string;
  nome: string;
  prezzo: number;
  quantita: number;
}

export function ResocontoCliente({
  voci,
  totale,
  tavolo,
  coperti,
  titolo = 'Resoconto',
  nota,
  vuoto = 'Nessun piatto ancora — comincia dal menù qui a fianco.',
}: {
  voci: VoceResoconto[];
  totale: number;
  /** Tavolo e coperti compaiono solo dove esistono: alla cassa dei tavoli sì,
   * a un banco no — lì si compra e si porta via. */
  tavolo?: number | null;
  coperti?: number | null;
  titolo?: string;
  /** Una riga sotto il titolo, quando c'è qualcosa da spiegare. */
  nota?: string;
  /** Cosa scrivere quando non è stato battuto ancora niente. */
  vuoto?: string;
}) {
  const pezzi = voci.reduce((somma, voce) => somma + voce.quantita, 0);
  const conTavolo = tavolo !== undefined || coperti !== undefined;

  return (
    <section className="riquadro resoconto-cliente">
      <div className="testa-resoconto">
        <div>
          <h2>{titolo}</h2>
          {nota && <p className="spiegazione">{nota}</p>}
        </div>
        {/* Tavolo e coperti stanno in alto a destra, grandi: sono la prima cosa
            che si ricontrolla prima di confermare, e senza di loro l'ordine non
            parte. Finché mancano restano due caselle vuote, non spariscono: il
            posto vuoto si nota, l'assenza no. */}
        {conTavolo && (
          <div className="targhette-resoconto">
            <span className="targhetta-resoconto">
              <small>Tavolo</small>
              <strong>{tavolo ?? '—'}</strong>
            </span>
            <span className="targhetta-resoconto">
              <small>Coperti</small>
              <strong>{coperti ?? '—'}</strong>
            </span>
          </div>
        )}
      </div>

      {voci.length === 0 ? (
        <p className="vuoto vuoto-resoconto">{vuoto}</p>
      ) : (
        /* L'elenco scorre dentro di sé quando l'ordine è lungo: il totale e i
           tasti sotto restano al loro posto invece di finire fuori schermo. */
        <ul className="voci-resoconto">
          {voci.map((voce) => (
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
        <strong className="cifra-totale-resoconto">{euro(totale)}</strong>
      </div>
    </section>
  );
}
