import { useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useLetteraCassa, useOrdiniAperti, useOrdiniCompletati, useUtenteAutenticato } from '../hooks';
import { annullaOrdine, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';

/** Quanti ordini della lista al massimo si mostrano: a fine serata i
 * completati sono centinaia e riempirebbero lo schermo, mentre quello che
 * serve davvero è il numero. */
const ULTIMI_MOSTRATI = 10;

/** Un quadrato con un numero grande: il colpo d'occhio di fine serata. Il
 * contenuto sotto è facoltativo, così lo stesso quadrato vale sia per i
 * contatori con l'elenco sia per quelli con il solo numero. */
function Quadrato({
  titolo,
  valore,
  tono,
  spiegazione,
  children,
}: {
  titolo: string;
  valore: string;
  /** "incasso" colora il quadrato in modo diverso: sono soldi, non ordini. */
  tono?: 'ordini' | 'incasso' | 'incasso-totale';
  spiegazione?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className={`quadrato quadrato-${tono ?? 'ordini'}`}>
      <h2>{titolo}</h2>
      <p className="valore-quadrato">{valore}</p>
      {spiegazione && <p className="spiegazione">{spiegazione}</p>}
      {children}
    </section>
  );
}

function RigaOrdine({
  ordine,
  amministratore,
  puoAnnullare,
}: {
  ordine: Ordine;
  amministratore: boolean;
  /** La cassa annulla solo gli ordini non ancora incassati; il resto è
   * dell'amministratore, come nelle regole del server. */
  puoAnnullare?: boolean;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function handleAnnulla() {
    if (!window.confirm(`Annullare l'ordine ${ordine.codice ?? `n. ${ordine.numero}`} (${euro(ordine.totale)})?`)) return;
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
    <li className="riga-ordine-aperto">
      <span className="numero">{ordine.codice ?? `n. ${ordine.numero}`}</span>
      <span className="dettagli">
        <span>
          {ordine.tipo === 'qr' ? `Tavolo ${ordine.tavolo}` : 'Cassa'} · {articoli} articoli
        </span>
        <span>{euro(ordine.totale)}</span>
      </span>
      {(amministratore || puoAnnullare) && (
        <button type="button" className="bottone-annulla" onClick={handleAnnulla} disabled={inCorso}>
          {inCorso ? 'Annullamento…' : 'Annulla'}
        </button>
      )}
      {errore && <p className="errore">{errore}</p>}
    </li>
  );
}

export function FineSerata({ amministratore }: { amministratore: boolean }) {
  const ordini = useOrdiniAperti();
  const completati = useOrdiniCompletati();
  const { utente } = useUtenteAutenticato();
  const miaLettera = useLetteraCassa(utente?.uid);

  const bozze = ordini.filter((o) => o.stato === 'bozza');
  const daPagare = ordini.filter((o) => o.stato === 'da_pagare');
  const inEvasione = ordini.filter((o) => o.stato === 'in_evasione');

  // L'incasso lo fanno gli ordini pagati: quelli partiti verso i reparti e
  // quelli già consegnati. Le bozze e i confermati non ancora pagati no, e
  // gli annullati nemmeno — non compaiono in nessuna delle due liste.
  const pagati = [...inEvasione, ...completati];
  const incassoTotale = pagati.reduce((somma, o) => somma + o.totale, 0);

  // Un quadrato per ogni cassa che ha incassato, più sempre il proprio: chi
  // sta lavorando vede il suo conto anche prima del primo ordine.
  const perCassa = new Map<string, { totale: number; ordini: number }>();
  if (miaLettera) perCassa.set(miaLettera, { totale: 0, ordini: 0 });
  for (const ordine of pagati) {
    const lettera = ordine.cassa ?? '';
    const conto = perCassa.get(lettera) ?? { totale: 0, ordini: 0 };
    perCassa.set(lettera, { totale: conto.totale + ordine.totale, ordini: conto.ordini + 1 });
  }
  const casse = [...perCassa.entries()].sort(([a], [b]) => a.localeCompare(b));

  const ultimiCompletati = [...completati].reverse().slice(0, ULTIMI_MOSTRATI);

  return (
    <div className="fine-serata">
      {casse.map(([lettera, conto]) => (
        <Quadrato
          key={lettera || 'senza'}
          titolo={lettera ? `Incasso cassa ${lettera}` : 'Incasso senza cassa'}
          valore={euro(conto.totale)}
          tono="incasso"
          spiegazione={
            lettera
              ? `${conto.ordini} ${conto.ordini === 1 ? 'ordine pagato' : 'ordini pagati'}`
              : `${conto.ordini} ${conto.ordini === 1 ? 'ordine' : 'ordini'} senza lettera di cassa`
          }
        />
      ))}

      <Quadrato
        titolo="Incasso totale"
        valore={euro(incassoTotale)}
        tono="incasso-totale"
        spiegazione={`Tutte le casse insieme, ${pagati.length} ${pagati.length === 1 ? 'ordine pagato' : 'ordini pagati'}`}
      />

      <Quadrato
        titolo="Ordini completati"
        valore={String(completati.length)}
        spiegazione="Ordini pagati e consegnati per intero: qui non c'è più niente da fare."
      >
        {completati.length === 0 ? (
          <p className="vuoto">Nessun ordine completato.</p>
        ) : (
          <>
            <ul>
              {ultimiCompletati.map((o) => (
                <RigaOrdine key={o.id} ordine={o} amministratore={false} />
              ))}
            </ul>
            {completati.length > ULTIMI_MOSTRATI && (
              <p className="spiegazione">
                Qui sopra gli ultimi {ULTIMI_MOSTRATI}, più altri {completati.length - ULTIMI_MOSTRATI} prima di
                questi.
              </p>
            )}
          </>
        )}
      </Quadrato>

      <Quadrato
        titolo="Confermati e non incassati"
        valore={String(daPagare.length)}
        spiegazione="Ordini con il numero già stampato che nessuno ha pagato: annullandoli le porzioni tornano libere."
      >
        {daPagare.length === 0 ? (
          <p className="vuoto">Nessun ordine in attesa di pagamento.</p>
        ) : (
          <ul>
            {daPagare.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} puoAnnullare />
            ))}
          </ul>
        )}
      </Quadrato>

      <Quadrato
        titolo="Bozze mai confermate"
        valore={String(bozze.length)}
        spiegazione="Ordini inviati dal tavolo ma mai passati in cassa: non sono mai partiti."
      >
        {bozze.length === 0 ? (
          <p className="vuoto">Nessuna bozza in sospeso.</p>
        ) : (
          <ul>
            {bozze.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} />
            ))}
          </ul>
        )}
      </Quadrato>

      <Quadrato
        titolo="Pagati non completati"
        valore={String(inEvasione.length)}
        spiegazione="Ordini pagati e inviati ai reparti, ma non ancora consegnati del tutto."
      >
        {inEvasione.length === 0 ? (
          <p className="vuoto">Nessun ordine in sospeso.</p>
        ) : (
          <ul>
            {inEvasione.map((o) => (
              <RigaOrdine key={o.id} ordine={o} amministratore={amministratore} />
            ))}
          </ul>
        )}
      </Quadrato>
    </div>
  );
}
