import { useMemo, useState } from 'react';
import { NOME_BANCO, millisecondiTimestamp, type Banco, type OrdineBanco } from '@sagra-mazzocco/shared';
import { useOrdiniBanco } from '../hooks';
import { annullaOrdineBanco, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';
import { ordinePerStampa } from './CassaBanco';

/** L'archivio del banco: tutto quello che è stato battuto stasera.
 *
 * Si guarda, si ristampa uno scontrino perso, si annulla un incasso sbagliato.
 * Non si lavora da qui — il lavoro sta nella scheda "Cassa" — e non si
 * cancella niente: un ordine annullato resta in elenco barrato, perché a fine
 * serata sapere che una cifra è stata tolta vale quanto la cifra. */

function oraDi(ordine: OrdineBanco): string {
  if (!ordine.createdAt) return '—';
  return new Date(millisecondiTimestamp(ordine.createdAt)).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function RigaOrdine({ ordine }: { ordine: OrdineBanco }) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const annullato = ordine.stato === 'annullato';

  async function annulla() {
    if (
      !window.confirm(
        `Annullare lo scontrino ${ordine.codice} (${euro(ordine.totale)})? Esce dall'incasso della serata ma resta in elenco.`
      )
    )
      return;
    setErrore(null);
    setInCorso(true);
    try {
      await annullaOrdineBanco({ serataId: SERATA_ID_OGGI, ordineId: ordine.id });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);

  return (
    <li className={`riga-riepilogo stato-${annullato ? 'annullato' : 'fatto'}`}>
      <div className="sommario-ordine">
        <span className="numero">{ordine.codice}</span>
        <span className="dettagli">
          <span>
            {articoli} {articoli === 1 ? 'articolo' : 'articoli'} · {oraDi(ordine)}
            {ordine.operatoreNome && ` · ${ordine.operatoreNome}`}
          </span>
          <span className={`targhetta-stato ${annullato ? 'annullato' : 'fatto'}`}>
            {annullato ? 'Annullato' : 'Incassato'}
          </span>
        </span>
        <span className="prezzo">{euro(ordine.totale)}</span>
        <span className="azioni-riga">
          <button type="button" onClick={() => setAperto((prec) => !prec)}>
            {aperto ? 'Chiudi' : 'Vedi'}
          </button>
          <button type="button" onClick={() => stampa([{ tipo: 'scontrinoBanco', ordine: ordinePerStampa(ordine) }])}>
            Ristampa
          </button>
          {!annullato && (
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

export function OrdiniBanco({ banco }: { banco: Banco }) {
  const ordini = useOrdiniBanco(banco);
  const [cerca, setCerca] = useState('');

  const trovati = useMemo(() => {
    const testo = cerca.trim().toLowerCase();
    if (!testo) return ordini;
    return ordini.filter(
      (ordine) =>
        ordine.codice.toLowerCase().includes(testo) ||
        ordine.items.some((item) => item.nome.toLowerCase().includes(testo))
    );
  }, [ordini, cerca]);

  const incassati = ordini.filter((o) => o.stato === 'incassato');
  const incasso = incassati.reduce((somma, o) => somma + o.totale, 0);
  const annullati = ordini.length - incassati.length;

  return (
    <div className="riepilogo-ordini">
      <section className="riquadro">
        <h2>Ordini {NOME_BANCO[banco]}</h2>
        <p className="spiegazione">
          Tutto quello che è stato battuto stasera a questo banco. Gli ordini annullati restano in elenco, barrati:
          escono dall'incasso, non dalla storia della serata.
        </p>

        <div className="barra-filtri">
          <label>
            Cerca ordine
            <input
              type="search"
              placeholder="numero o voce"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
            />
          </label>
          <span className="esito-filtro">
            {trovati.length === ordini.length
              ? `${ordini.length} ${ordini.length === 1 ? 'ordine' : 'ordini'}`
              : `${trovati.length} ${trovati.length === 1 ? 'ordine' : 'ordini'} su ${ordini.length}`}
          </span>
          <span className="totale-archivio">
            Incasso <strong>{euro(incasso)}</strong>
            {annullati > 0 && (
              <small>
                {' '}
                · {annullati} {annullati === 1 ? 'annullato' : 'annullati'}
              </small>
            )}
          </span>
        </div>

        {trovati.length === 0 ? (
          <p className="vuoto">
            {ordini.length === 0
              ? 'Nessun ordine battuto stasera a questo banco.'
              : 'Nessun ordine con questo testo.'}
          </p>
        ) : (
          <ul className="elenco-riepilogo">
            {trovati.map((ordine) => (
              <RigaOrdine key={ordine.id} ordine={ordine} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
