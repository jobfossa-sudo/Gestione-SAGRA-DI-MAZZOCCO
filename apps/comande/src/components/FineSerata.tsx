import { useState } from 'react';
import { tempoEmissione, type Ordine } from '@sagra-mazzocco/shared';
import { useLetteraCassa, useOrdiniAperti, useOrdiniCompletati, useUtenteAutenticato } from '../hooks';
import { annullaOrdine, messaggioErrore } from '../services/callables';
import { durata, euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';

/** Un quadrato con il solo numero in grande: il colpo d'occhio di fine
 * serata. Niente elenchi qui dentro — quelli stanno tutti in fondo alla
 * pagina, così la prima schermata si legge da lontano. */
function Quadrato({
  titolo,
  valore,
  tono,
  spiegazione,
}: {
  titolo: string;
  valore: string;
  /** Il tono colora il quadrato: i soldi non si devono confondere con i
   * conteggi, e il tempo non è né l'una né l'altra cosa. */
  tono?: 'ordini' | 'tempo' | 'incasso' | 'incasso-totale';
  spiegazione?: string;
}) {
  return (
    <section className={`quadrato quadrato-${tono ?? 'ordini'}`}>
      <h2>{titolo}</h2>
      <p className="valore-quadrato">{valore}</p>
      {spiegazione && <p className="spiegazione">{spiegazione}</p>}
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

  // Gli ordini che hanno davvero avuto un numero di comanda: in attesa di
  // pagamento, in mano ai reparti, consegnati. Le bozze mai confermate restano
  // fuori — hanno già il loro quadrato — altrimenti provenienza e coperti
  // racconterebbero due serate diverse.
  const confermati = [...daPagare, ...inEvasione, ...completati];
  const daCassa = confermati.filter((o) => o.tipo === 'cassa').length;
  const daCellulare = confermati.filter((o) => o.tipo === 'qr').length;
  const coperti = confermati.reduce((somma, o) => somma + (o.coperti ?? 0), 0);

  // Quanto ci mette un ordine da quando parte verso i reparti a quando viene
  // letto il suo codice a barre. Il più lento in cima: è quello su cui c'è da
  // capire qualcosa.
  const tempi = completati
    .map((ordine) => ({ ordine, millisecondi: tempoEmissione(ordine) }))
    .filter((riga): riga is { ordine: Ordine; millisecondi: number } => riga.millisecondi !== null)
    .sort((a, b) => b.millisecondi - a.millisecondi);
  const tempoMedio =
    tempi.length > 0 ? tempi.reduce((somma, riga) => somma + riga.millisecondi, 0) / tempi.length : null;

  // Gli elenchi stanno sotto i quadrati, e solo dove c'è qualcosa da fare:
  // annullare un ordine abbandonato o andare a cercare una comanda rimasta
  // indietro. Gli ordini completati non hanno elenco: non c'è niente da farci.
  const daSistemare: { titolo: string; ordini: Ordine[]; puoAnnullare?: boolean }[] = [
    { titolo: 'Confermati e non incassati', ordini: daPagare, puoAnnullare: true },
    { titolo: 'Bozze mai confermate', ordini: bozze },
    { titolo: 'Pagati non completati', ordini: inEvasione },
  ].filter((gruppo) => gruppo.ordini.length > 0);

  return (
    <div className="fine-serata">
      {/* Prima riga: com'è andata la serata nel suo insieme. */}
      <div className="riga-quadrati">
        <Quadrato
          titolo="Ordini dalla cassa"
          valore={String(daCassa)}
          spiegazione="Composti al banco dal cassiere."
        />
        <Quadrato
          titolo="Ordini dal cellulare"
          valore={String(daCellulare)}
          spiegazione="Arrivati dal QR del tavolo e poi confermati in cassa."
        />
        <Quadrato
          titolo="Coperti"
          valore={String(coperti)}
          spiegazione={`Persone servite, da ${confermati.length} ${confermati.length === 1 ? 'comanda confermata' : 'comande confermate'}.`}
        />
        <Quadrato
          titolo="Tempo medio di emissione"
          valore={tempoMedio === null ? '—' : durata(tempoMedio)}
          tono="tempo"
          spiegazione={
            tempoMedio === null
              ? 'Si vede dopo la prima consegna della serata.'
              : `Dall'invio ai reparti alla consegna, su ${tempi.length} ${tempi.length === 1 ? 'ordine consegnato' : 'ordini consegnati'}.`
          }
        />
      </div>

      {/* Seconda riga: a che punto sono gli ordini, solo numeri. */}
      <div className="riga-quadrati">
        <Quadrato
          titolo="Ordini completati"
          valore={String(completati.length)}
          spiegazione="Pagati e consegnati per intero."
        />
        <Quadrato
          titolo="Confermati e non incassati"
          valore={String(daPagare.length)}
          spiegazione="Numero già stampato, mai pagati."
        />
        <Quadrato
          titolo="Bozze mai confermate"
          valore={String(bozze.length)}
          spiegazione="Inviati dal tavolo, mai passati in cassa."
        />
        <Quadrato
          titolo="Pagati non completati"
          valore={String(inEvasione.length)}
          spiegazione="Pagati e in mano ai reparti, non ancora consegnati."
        />
      </div>

      {/* Terza riga: quanto è stato incassato. */}
      <div className="riga-quadrati">
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
      </div>

      {daSistemare.length > 0 && (
        <div className="elenchi-fine-serata">
          {daSistemare.map((gruppo) => (
            <section key={gruppo.titolo}>
              <h2>
                {gruppo.titolo} <span className="contatore">{gruppo.ordini.length}</span>
              </h2>
              <ul>
                {gruppo.ordini.map((o) => (
                  <RigaOrdine
                    key={o.id}
                    ordine={o}
                    amministratore={amministratore}
                    puoAnnullare={gruppo.puoAnnullare}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {daSistemare.length === 0 && (
        <p className="vuoto">Non è rimasto niente in sospeso: la serata è a posto.</p>
      )}

      {tempi.length > 0 && (
        <section className="riquadro elenco-tempi">
          <h2>
            Tempi di emissione <span className="contatore">{tempi.length}</span>
          </h2>
          <p className="spiegazione">
            Quanto è passato tra l'invio ai reparti e la lettura del codice a barre, ordine per ordine. Il più
            lento sta in cima.
          </p>
          <ul>
            {tempi.map(({ ordine, millisecondi }) => (
              <li key={ordine.id} className="riga-tempo">
                <span className="numero">{ordine.codice ?? `n. ${ordine.numero}`}</span>
                <span className="dettagli">
                  Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'}{' '}
                  {ordine.coperti === 1 ? 'coperto' : 'coperti'}
                </span>
                <span className="tempo">{durata(millisecondi)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
