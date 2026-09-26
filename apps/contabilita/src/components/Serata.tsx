import { useOrdini, useOrdiniBanco, useEntrate, usePresenze, useUscite } from '../hooks';
import { contoEconomico, incassoDiSerata, rendimentoVolontari, vendutoDiSerata } from '../services/conti';
import { euro } from '../services/formato';
import { Quadrato } from './Quadrato';

/** Il cruscotto della serata: com'è andata, mentre sta andando.
 *
 * Tutto quello che c'è qui dentro lo produce Comande da solo, senza che
 * nessuno batta niente in più: gli ordini dei tavoli e gli scontrini dei
 * banchi. Le spese le aggiunge la scheda "Uscite", e l'utile qui sotto è
 * stimato proprio perché quelle arrivano quando arrivano. */
export function Serata({ serataId, edizioneId }: { serataId: string | null; edizioneId: string }) {
  const ordini = useOrdini(serataId);
  const ordiniBanco = useOrdiniBanco(serataId);
  const uscite = useUscite(edizioneId);
  const entrate = useEntrate(edizioneId);
  const presenze = usePresenze(serataId);

  const incasso = incassoDiSerata(ordini, ordiniBanco);
  const conto = contoEconomico(incasso.totale, entrate, uscite, serataId);
  const resa = rendimentoVolontari(incasso.totale, incasso.coperti, [...presenze.values()]);
  const venduto = vendutoDiSerata(ordini, ordiniBanco).slice(0, 8);

  return (
    <div className="cruscotto">
      <div className="riga-quadrati">
        <Quadrato
          titolo="Incasso della serata"
          valore={euro(incasso.totale)}
          tono="incasso-totale"
          spiegazione={`${incasso.ordini} ${incasso.ordini === 1 ? 'comanda' : 'comande'} fra tavoli e banchi`}
        />
        <Quadrato titolo="Contanti" valore={euro(incasso.contanti)} tono="incasso" spiegazione="Da contare nei cassetti" />
        <Quadrato titolo="POS" valore={euro(incasso.elettronico)} tono="incasso" spiegazione="Da confrontare col terminale" />
        <Quadrato
          titolo="Utile stimato"
          valore={euro(conto.utile)}
          tono="utile"
          spiegazione="Incasso più entrate extra, meno le spese attribuite a questa serata"
        />
      </div>

      <div className="riga-quadrati">
        <Quadrato titolo="Coperti" valore={String(incasso.coperti)} spiegazione="Persone servite ai tavoli" />
        <Quadrato
          titolo="Scontrino medio"
          valore={euro(incasso.medio)}
          spiegazione="Incasso diviso il numero di comande"
        />
        <Quadrato
          titolo="Volontari presenti"
          valore={resa.presenti === 0 ? '—' : String(resa.presenti)}
          spiegazione={resa.presenti === 0 ? 'Da spuntare nella scheda Presenze' : `${resa.peso} serate piene`}
        />
        <Quadrato
          titolo="Resa per volontario"
          valore={resa.peso === 0 ? '—' : euro(resa.incassoPerVolontario)}
          spiegazione={
            resa.peso === 0
              ? 'Compare quando ci sono le presenze'
              : `${resa.copertiPerVolontario} coperti a testa`
          }
        />
      </div>

      <section className="riquadro">
        <h2>Cassetto per cassetto</h2>
        <p className="spiegazione">
          Quanto ha incassato ogni punto vendita, e come. Il conteggio di quello che c'è davvero si fa nella scheda
          "Chiusura".
        </p>
        {incasso.punti.length === 0 ? (
          <p className="vuoto">Nessun incasso in questa serata.</p>
        ) : (
          <table className="tabella-conti">
            <thead>
              <tr>
                <th>Punto</th>
                <th className="destra">Comande</th>
                <th className="destra">Contanti</th>
                <th className="destra">POS</th>
                <th className="destra">Totale</th>
              </tr>
            </thead>
            <tbody>
              {incasso.punti.map((punto) => (
                <tr key={punto.id}>
                  <td>{punto.nome}</td>
                  <td className="destra">{punto.quanti}</td>
                  <td className="destra">{euro(punto.contanti)}</td>
                  <td className="destra">{euro(punto.elettronico)}</td>
                  <td className="destra">
                    <strong>{euro(punto.totale)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="riquadro">
        <h2>Cosa è andato di più</h2>
        <p className="spiegazione">
          Tavoli e banchi insieme: per i conti una birra è una birra, ovunque sia stata venduta.
        </p>
        {venduto.length === 0 ? (
          <p className="vuoto">Ancora niente venduto.</p>
        ) : (
          <table className="tabella-conti">
            <thead>
              <tr>
                <th>Voce</th>
                <th className="destra">Quantità</th>
                <th className="destra">Incasso</th>
              </tr>
            </thead>
            <tbody>
              {venduto.map((riga) => (
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
        )}
      </section>
    </div>
  );
}
