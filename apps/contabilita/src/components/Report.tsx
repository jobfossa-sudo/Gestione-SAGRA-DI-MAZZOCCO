import { useMemo, useState } from 'react';
import type { Serata } from '@sagra-mazzocco/shared';
import { useEntrate, useTotaliSerate, useUscite } from '../hooks';
import { arrotonda, contoEconomico, incassoDiSerata, vendutoDiSerata } from '../services/conti';
import { euro } from '../services/formato';
import { nomeSerata } from './SceltaSerata';

/** Il conto dell'evento intero, e il foglio da far girare ai volontari.
 *
 * Sono due cose diverse apposta. Il conto economico è per chi organizza: ci
 * sono le spese, i margini, quello che non torna. Il riepilogo per i volontari
 * ha dentro quattro numeri e un grazie — chi ha lavorato tre sere vuole sapere
 * com'è andata, non leggere un bilancio. */
export function Report({ edizioneId, serate }: { edizioneId: string; serate: Serata[] }) {
  const uscite = useUscite(edizioneId);
  const entrate = useEntrate(edizioneId);
  const serateEdizione = useMemo(() => serate.filter((s) => s.id.startsWith(edizioneId)), [serate, edizioneId]);
  const totali = useTotaliSerate(useMemo(() => serateEdizione.map((s) => s.id), [serateEdizione]));
  const [mostraUtile, setMostraUtile] = useState(false);
  const [copiato, setCopiato] = useState(false);

  const righe = serateEdizione.map((serata) => {
    const dati = totali.get(serata.id) ?? { ordini: [], banco: [] };
    const incasso = incassoDiSerata(dati.ordini, dati.banco);
    const conto = contoEconomico(incasso.totale, entrate, uscite, serata.id);
    return { serata, incasso, conto };
  });

  const incassoCasse = arrotonda(righe.reduce((somma, r) => somma + r.incasso.totale, 0));
  const coperti = righe.reduce((somma, r) => somma + r.incasso.coperti, 0);
  const conto = contoEconomico(incassoCasse, entrate, uscite, null);

  // Il più venduto di tutta l'edizione: si rimettono insieme le voci di tutte
  // le serate, perché un piatto forte lo è nell'arco della sagra, non di una
  // sera.
  const venduto = useMemo(() => {
    const tutti = righe.flatMap((r) => {
      const dati = totali.get(r.serata.id) ?? { ordini: [], banco: [] };
      return vendutoDiSerata(dati.ordini, dati.banco);
    });
    const mappa = new Map<string, { nome: string; quantita: number; incasso: number }>();
    for (const riga of tutti) {
      const somma = mappa.get(riga.nome) ?? { nome: riga.nome, quantita: 0, incasso: 0 };
      somma.quantita += riga.quantita;
      somma.incasso = arrotonda(somma.incasso + riga.incasso);
      mappa.set(riga.nome, somma);
    }
    return [...mappa.values()].sort((a, b) => b.quantita - a.quantita);
  }, [righe, totali]);

  // "1 serate" su un foglio che leggono tutti fa brutta figura.
  const quanteSerate = `${serateEdizione.length} ${serateEdizione.length === 1 ? 'serata' : 'serate'}`;

  const testoVolontari = [
    `SAGRA DI MAZZOCCO ${edizioneId}`,
    '',
    `${coperti} coperti serviti in ${quanteSerate}`,
    `${euro(conto.entrate)} incassati`,
    venduto[0] ? `Il più venduto: ${venduto[0].nome} (${venduto[0].quantita})` : '',
    mostraUtile ? `Avanzo dell'edizione: ${euro(conto.utile)}` : '',
    '',
    'Grazie a tutti!',
  ]
    .filter((riga) => riga !== '')
    .join('\n');

  async function copia() {
    try {
      await navigator.clipboard.writeText(testoVolontari);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      // Browser che non lascia copiare: il testo è comunque lì da selezionare.
      setCopiato(false);
    }
  }

  return (
    <div className="report">
      <section className="riquadro">
        <h2>Conto economico dell'edizione {edizioneId}</h2>
        <p className="spiegazione">
          Entrate meno uscite. Contano solo le spese già pagate e le entrate già incassate: i preventivi restano
          fuori finché non diventano veri.
        </p>
        <table className="tabella-conti tabella-bilancio">
          <tbody>
            <tr>
              <td>Incasso delle casse e dei banchi</td>
              <td className="destra">{euro(conto.incassoCasse)}</td>
            </tr>
            <tr>
              <td>Entrate extra (sponsor, lotteria…)</td>
              <td className="destra">{euro(conto.entrateExtra)}</td>
            </tr>
            <tr className="riga-somma">
              <td>Totale entrate</td>
              <td className="destra">{euro(conto.entrate)}</td>
            </tr>
            <tr>
              <td>Spese attribuite alle serate</td>
              <td className="destra">− {euro(conto.usciteDiSerata)}</td>
            </tr>
            <tr>
              <td>Spese dell'evento</td>
              <td className="destra">− {euro(conto.usciteDellEvento)}</td>
            </tr>
            <tr className="riga-somma">
              <td>Totale uscite</td>
              <td className="destra">− {euro(conto.uscite)}</td>
            </tr>
            <tr className={`riga-utile ${conto.utile >= 0 ? 'positivo' : 'negativo'}`}>
              <td>{conto.utile >= 0 ? 'Avanzo' : 'Perdita'}</td>
              <td className="destra">{euro(conto.utile)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="riquadro">
        <h2>Serata per serata</h2>
        <table className="tabella-conti">
          <thead>
            <tr>
              <th>Serata</th>
              <th className="destra">Coperti</th>
              <th className="destra">Incasso</th>
              <th className="destra">Spese della sera</th>
              <th className="destra">Differenza</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(({ serata, incasso, conto: contoSerata }) => (
              <tr key={serata.id}>
                <td>{nomeSerata(serata.id)}</td>
                <td className="destra">{incasso.coperti}</td>
                <td className="destra">{euro(incasso.totale)}</td>
                <td className="destra">{euro(contoSerata.usciteDiSerata)}</td>
                <td className="destra">
                  <strong>{euro(contoSerata.utile)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Totale</td>
              <td className="destra">{coperti}</td>
              <td className="destra">{euro(incassoCasse)}</td>
              <td className="destra">{euro(conto.usciteDiSerata)}</td>
              <td className="destra">
                <strong>{euro(arrotonda(conto.entrate - conto.usciteDiSerata))}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
        <p className="spiegazione">
          Le spese dell'evento ({euro(conto.usciteDellEvento)}) non sono divise fra le serate: spalmarle darebbe un
          utile per serata che sembra preciso e non lo è.
        </p>
      </section>

      {venduto.length > 0 && (
        <section className="riquadro">
          <h2>I più venduti dell'edizione</h2>
          <table className="tabella-conti">
            <thead>
              <tr>
                <th>Voce</th>
                <th className="destra">Quantità</th>
                <th className="destra">Incasso</th>
              </tr>
            </thead>
            <tbody>
              {venduto.slice(0, 15).map((riga) => (
                <tr key={riga.nome}>
                  <td>{riga.nome}</td>
                  <td className="destra">
                    <strong>{riga.quantita}</strong>
                  </td>
                  <td className="destra">{euro(riga.incasso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="riquadro riquadro-volontari">
        <h2>Riepilogo per i volontari</h2>
        <p className="spiegazione">
          Poche cose, grandi. Stampalo e appendilo, oppure copialo e incollalo nel gruppo.
        </p>

        <label className="riga-spunta">
          <input type="checkbox" checked={mostraUtile} onChange={(e) => setMostraUtile(e.target.checked)} />
          Mostra anche quanto è avanzato
        </label>

        <div className="foglio-volontari">
          <span className="occhiello">Sagra di Mazzocco · {edizioneId}</span>
          <p className="numerone">{coperti}</p>
          <p className="didascalia">coperti serviti in {quanteSerate}</p>
          <p className="numerone">{euro(conto.entrate)}</p>
          <p className="didascalia">incassati</p>
          {venduto[0] && (
            <p className="riga-volontari">
              Il più venduto: <strong>{venduto[0].nome}</strong> ({venduto[0].quantita})
            </p>
          )}
          {mostraUtile && (
            <p className="riga-volontari">
              Avanzo dell'edizione: <strong>{euro(conto.utile)}</strong>
            </p>
          )}
          <p className="grazie">Grazie a tutti!</p>
        </div>

        <div className="tasti-volontari">
          <button type="button" className="bottone-principale" onClick={() => window.print()}>
            Stampa il foglio
          </button>
          <button type="button" onClick={copia}>
            {copiato ? 'Copiato!' : 'Copia il testo'}
          </button>
        </div>
      </section>
    </div>
  );
}
