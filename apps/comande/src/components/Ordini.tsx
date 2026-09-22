import { useMemo, useState } from 'react';
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

/** Sul tasto del filtro lo stato sta scritto corto: la frase lunga serve sulla
 * targhetta della riga, dove c'è spazio e va capita da sola. In fila con altri
 * cinque tasti, invece, allungherebbe solo la barra. */
const NOME_CORTO: Record<StatoOrdine, string> = {
  bozza: 'dal tavolo',
  da_pagare: 'mai incassato',
  confermata_pagata: 'pagato',
  in_evasione: 'in preparazione',
  completata: 'consegnato',
  annullata: 'annullato',
};

/** L'ordine in cui compaiono i tasti dei filtri: quello della vita di un
 * ordine, non quello dei conteggi. Se dipendesse da quanti ordini ci sono, i
 * tasti si sposterebbero sotto il dito di chi li sta premendo. */
const STATI_IN_ORDINE: StatoOrdine[] = [
  'bozza',
  'da_pagare',
  'confermata_pagata',
  'in_evasione',
  'completata',
  'annullata',
];

function oraDi(ordine: Ordine): string {
  const orario = ordine.confirmedAt ?? ordine.createdAt;
  if (!orario) return '—';
  return new Date(orario.seconds * 1000).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/** Quello che si è scritto nella casella, ripulito: senza spazi ai lati, tutto
 * maiuscolo e senza la "n." che viene naturale mettere davanti al numero. */
function ripulisci(scritto: string): string {
  let testo = scritto.trim().toUpperCase();
  if (testo.startsWith('N.')) testo = testo.slice(2).trim();
  return testo;
}

/** Vero se l'ordine risponde a quello che si sta cercando. Vale sia il codice
 * di comanda (A0012, anche solo un pezzo) sia il numero progressivo, perché il
 * cliente col telefono conosce solo il secondo. */
function corrisponde(ordine: Ordine, cercato: string): boolean {
  if (!cercato) return true;
  if ((ordine.codice ?? '').toUpperCase().includes(cercato)) return true;
  return String(ordine.numero).includes(cercato);
}

function RigaOrdine({ ordine, evidenziato }: { ordine: Ordine; evidenziato: boolean }) {
  const [aperto, setAperto] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Un ordine già consegnato o già annullato non si tocca più: il cibo è al
  // tavolo, oppure le porzioni sono già tornate vendibili.
  const annullabile = ordine.stato !== 'completata' && ordine.stato !== 'annullata';
  // Senza numero di comanda non c'è un foglio da ristampare: una bozza dal
  // tavolo il suo foglio non l'ha mai avuto.
  const ristampabile = Boolean(ordine.codice);
  // Cercato per codice e trovato da solo: si apre da sé, perché chi lo cerca
  // vuole vedere cosa c'è dentro, non premere un altro tasto.
  const mostraVoci = aperto || evidenziato;

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
    <li className={`riga-riepilogo stato-${TONO_STATO[ordine.stato]}${evidenziato ? ' evidenziata' : ''}`}>
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
            {mostraVoci ? 'Chiudi' : 'Vedi'}
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

      {mostraVoci && (
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
  const [cerca, setCerca] = useState('');
  const [filtro, setFiltro] = useState<StatoOrdine | 'tutti'>('tutti');

  const cercato = ripulisci(cerca);

  // Quanti ordini per ogni stato, per scrivere il numero sul tasto del filtro.
  const conteggi = useMemo(() => {
    const conto = {} as Record<StatoOrdine, number>;
    for (const ordine of ordini) conto[ordine.stato] = (conto[ordine.stato] ?? 0) + 1;
    return conto;
  }, [ordini]);

  // Si mostrano solo i filtri che stasera servono davvero: un tasto
  // "annullato" in una serata senza annullamenti è solo un tasto che non fa
  // niente, e gli stati vecchi non devono comparire dove non ce ne sono.
  const statiPresenti = STATI_IN_ORDINE.filter((stato) => (conteggi[stato] ?? 0) > 0);

  const mostrati = ordini.filter(
    (ordine) => (filtro === 'tutti' || ordine.stato === filtro) && corrisponde(ordine, cercato)
  );
  const filtrando = filtro !== 'tutti' || cercato !== '';

  const vivi = ordini.filter((o) => o.stato !== 'annullata');
  const incasso = ordini
    .filter((o) => o.stato === 'in_evasione' || o.stato === 'completata' || o.stato === 'confermata_pagata')
    .reduce((somma, o) => somma + o.totale, 0);

  function mostraTutti() {
    setCerca('');
    setFiltro('tutti');
  }

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

        <div className="barra-filtri">
          <label className="casella-cerca">
            <span>Cerca ordine</span>
            <input
              type="search"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="codice o numero"
              autoComplete="off"
            />
          </label>
          <div className="filtri-stato" role="group" aria-label="Filtra per stato">
            <button
              type="button"
              className={`filtro${filtro === 'tutti' ? ' scelto' : ''}`}
              aria-pressed={filtro === 'tutti'}
              onClick={() => setFiltro('tutti')}
            >
              Tutti <span className="quanti">{ordini.length}</span>
            </button>
            {statiPresenti.map((stato) => (
              <button
                key={stato}
                type="button"
                className={`filtro ${TONO_STATO[stato]}${filtro === stato ? ' scelto' : ''}`}
                aria-pressed={filtro === stato}
                onClick={() => setFiltro(stato)}
              >
                {NOME_CORTO[stato]} <span className="quanti">{conteggi[stato]}</span>
              </button>
            ))}
          </div>
        </div>

        {filtrando && ordini.length > 0 && (
          <p className="esito-filtro">
            {mostrati.length === 0
              ? 'Nessun ordine con questi filtri.'
              : `${mostrati.length} ${mostrati.length === 1 ? 'ordine' : 'ordini'} su ${ordini.length}.`}{' '}
            <button type="button" className="come-link" onClick={mostraTutti}>
              Mostra tutti
            </button>
          </p>
        )}

        {ordini.length === 0 ? (
          <p className="vuoto">Nessun ordine di questo tipo, per ora.</p>
        ) : (
          <ul className="elenco-riepilogo">
            {mostrati.map((ordine) => (
              <RigaOrdine
                key={ordine.id}
                ordine={ordine}
                // Un solo ordine trovato: è quello che si stava cercando,
                // quindi compare già aperto sulle sue voci.
                evidenziato={cercato !== '' && mostrati.length === 1}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
