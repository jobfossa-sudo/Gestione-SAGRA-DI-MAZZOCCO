import { useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { confermaOrdine, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

function euro(valore: number): string {
  return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Il resoconto si mostra al cliente prima di incassare: è la sua ultima
 * occasione per dire "no, questo non l'ho ordinato". */
function Resoconto({
  ordine,
  inCorso,
  onConferma,
  onAnnulla,
}: {
  ordine: Ordine;
  inCorso: boolean;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);

  return (
    <div className="resoconto">
      <div className="testata-resoconto">
        <span className="numero-ordine">n. {ordine.numero}</span>
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

      <p className="spiegazione">Fai controllare l'ordine al cliente, incassa e solo allora conferma.</p>

      <div className="bottoni-resoconto">
        <button type="button" className="bottone-principale" disabled={inCorso} onClick={onConferma}>
          {inCorso ? 'Conferma in corso…' : 'Incassato — conferma e invia'}
        </button>
        <button type="button" disabled={inCorso} onClick={onAnnulla}>
          Torna indietro
        </button>
      </div>
    </div>
  );
}

export function ConfermaBozza() {
  const ordiniAperti = useOrdiniAperti();
  const bozze = ordiniAperti.filter((o) => o.stato === 'bozza');

  const [numero, setNumero] = useState('');
  const [daConfermare, setDaConfermare] = useState<Ordine | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

  /** Primo passo: si digita il numero e si richiama l'ordine. Il numero va
   * battuto a mano apposta — è la barriera contro il tasto premuto per
   * sbaglio — quindi l'elenco qui sotto non compila la casella. */
  function cercaOrdine(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggioSuccesso(null);

    const cercato = Number(numero);
    const trovato = ordiniAperti.find((o) => o.numero === cercato);
    if (!trovato) {
      setErrore(`Nessun ordine con numero ${cercato} in questa serata. Controlla il numero sullo schermo del cliente.`);
      return;
    }
    if (trovato.stato !== 'bozza') {
      setErrore(`L'ordine n. ${cercato} è già stato confermato e incassato.`);
      return;
    }
    setDaConfermare(trovato);
  }

  /** Secondo passo: il cliente ha controllato, la cassa ha incassato. */
  async function conferma() {
    if (!daConfermare) return;
    setErrore(null);
    setInCorso(true);
    try {
      const risultato = await confermaOrdine({ serataId: SERATA_ID_OGGI, numero: daConfermare.numero });
      setMessaggioSuccesso(
        `Ordine n. ${risultato.data.numero} confermato e inviato ai reparti — ${euro(risultato.data.totale)}`
      );
      setDaConfermare(null);
      setNumero('');
    } catch (err) {
      // Qui finiscono anche i piatti finiti tra l'invio dal tavolo e il
      // pagamento: il messaggio arriva dal server ed è già in italiano.
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="conferma-bozza">
      <section className="riquadro">
        <h2>Conferma un ordine dal tavolo</h2>
        <p className="spiegazione">
          Il cliente ha ordinato dal telefono inquadrando il QR: chiedigli il numero mostrato sullo schermo e
          digitalo qui. Vedrai il resoconto da fargli controllare prima di incassare. Solo dopo la conferma
          l'ordine parte verso i reparti.
        </p>

        {daConfermare ? (
          <Resoconto
            ordine={daConfermare}
            inCorso={inCorso}
            onConferma={conferma}
            onAnnulla={() => {
              setDaConfermare(null);
              setErrore(null);
            }}
          />
        ) : (
          <form className="cerca-ordine" onSubmit={cercaOrdine}>
            <label>
              Numero ordine
              <input
                type="number"
                min="1"
                placeholder="000"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                required
                autoFocus
              />
            </label>
            <button type="submit" className="bottone-principale" disabled={!numero.trim()}>
              Richiama l'ordine
            </button>
          </form>
        )}

        {errore && <p className="errore">{errore}</p>}
        {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}
      </section>

      <section className="riquadro">
        <h2>
          In attesa di pagamento <span className="contatore">{bozze.length}</span>
        </h2>
        <p className="spiegazione">
          Ordini arrivati dai tavoli e non ancora incassati. L'elenco serve a vedere a colpo d'occhio cosa manca: il
          numero va comunque digitato qui sopra.
        </p>
        {bozze.length === 0 ? (
          <p className="vuoto">Nessun ordine in attesa.</p>
        ) : (
          <ul className="elenco-bozze">
            {bozze.map((o) => {
              const articoli = o.items.reduce((somma, item) => somma + item.quantita, 0);
              return (
                <li key={o.id} className={o.numero === daConfermare?.numero ? 'richiamato' : undefined}>
                  <span className="numero">n. {o.numero}</span>
                  <span className="dettagli">
                    <span>
                      Tavolo {o.tavolo ?? '—'} · {articoli} {articoli === 1 ? 'articolo' : 'articoli'}
                    </span>
                    <span className="voci">{o.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</span>
                  </span>
                  <span className="prezzo">{euro(o.totale)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
