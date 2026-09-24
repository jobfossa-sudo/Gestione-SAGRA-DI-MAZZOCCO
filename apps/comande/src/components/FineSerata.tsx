import { BANCHI, NOME_BANCO, tempoEmissione, type Ordine } from '@sagra-mazzocco/shared';
import { useLetteraCassa, useOrdiniAperti, useOrdiniBanco, useOrdiniCompletati, useUtenteAutenticato } from '../hooks';
import { durata, euro } from '../services/formato';

/** Un quadrato con il solo numero in grande: il colpo d'occhio di fine
 * serata. Gli ordini rimasti in sospeso si contano qui e basta: gli elenchi
 * riga per riga allungavano la pagina e non si leggevano da lontano. Chi deve
 * metterci mano li trova in "Conferma ordine". */
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

export function FineSerata() {
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
  const incassoCasse = pagati.reduce((somma, o) => somma + o.totale, 0);

  // I banchi (BAR, BEVANDE) incassano per conto loro, ma i soldi della serata
  // sono gli stessi: ciascuno ha il suo quadrato e tutti entrano nel totale.
  // Gli ordini annullati restano in archivio ma non contano più niente.
  const ordiniBanco = useOrdiniBanco().filter((o) => o.stato === 'incassato');
  const banchi = BANCHI.map((banco) => {
    const suoi = ordiniBanco.filter((o) => o.banco === banco);
    return { banco, ordini: suoi.length, totale: suoi.reduce((somma, o) => somma + o.totale, 0) };
  });
  const incassoBanchi = banchi.reduce((somma, riga) => somma + riga.totale, 0);
  const incassoTotale = incassoCasse + incassoBanchi;

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
        {banchi.map((riga) => (
          <Quadrato
            key={riga.banco}
            titolo={`Incasso ${NOME_BANCO[riga.banco]}`}
            valore={euro(riga.totale)}
            tono="incasso"
            spiegazione={`${riga.ordini} ${riga.ordini === 1 ? 'scontrino battuto' : 'scontrini battuti'} al banco`}
          />
        ))}
        <Quadrato
          titolo="Incasso totale"
          valore={euro(incassoTotale)}
          tono="incasso-totale"
          spiegazione={`Casse e banchi insieme, ${pagati.length + ordiniBanco.length} ${
            pagati.length + ordiniBanco.length === 1 ? 'ordine pagato' : 'ordini pagati'
          }`}
        />
      </div>

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
