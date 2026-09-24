import { useMemo, useState } from 'react';
import { NOME_BANCO, type Banco, type OrdineBanco } from '@sagra-mazzocco/shared';
import { useCategorieBanco, useProdottiBanco } from '../hooks';
import { creaOrdineBanco, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';
import { ResocontoCliente } from './ResocontoCliente';

/** Il banco che vende: si batte, si incassa, esce lo scontrino.
 *
 * È la cassa dei tavoli senza tutto quello che al banco non succede: niente
 * tavolo, niente coperti, niente comande ai reparti, nessun passaggio tra
 * "confermato" e "pagato" — al banco si paga prima di andarsene, quindi un
 * ordine o esiste incassato o non esiste. Il tasto è uno solo, e fa tutto. */
export function CassaBanco({ banco }: { banco: Banco }) {
  const categorie = useCategorieBanco(banco);
  const prodotti = useProdottiBanco(banco);
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const perGruppo = useMemo(
    () =>
      categorie
        .map((gruppo) => ({ gruppo, voci: prodotti.filter((p) => p.categoriaId === gruppo.id) }))
        .filter((riga) => riga.voci.length > 0),
    [categorie, prodotti]
  );

  /** Le voci battute, nell'ordine in cui stanno nel menù: gruppo per gruppo e
   * riga per riga. Prendendole dall'elenco grezzo uscivano mescolate — il
   * caffè prima della birra — e il cliente non ritrovava sullo scontrino
   * l'ordine in cui le aveva chieste. In fondo finisce quello che è rimasto
   * nel carrello ma il cui gruppo è sparito nel frattempo: non si vende niente
   * di nascosto. */
  const selezionati = useMemo(() => {
    const inMenu = perGruppo.flatMap((riga) => riga.voci).filter((p) => (carrello[p.id] ?? 0) > 0);
    const visti = new Set(inMenu.map((p) => p.id));
    const orfani = prodotti.filter((p) => (carrello[p.id] ?? 0) > 0 && !visti.has(p.id));
    return [...inMenu, ...orfani];
  }, [perGruppo, prodotti, carrello]);
  const voci = selezionati.map((prodotto) => ({
    prodottoId: prodotto.id,
    nome: prodotto.nome,
    prezzo: prodotto.prezzo,
    quantita: carrello[prodotto.id],
  }));
  const totale = voci.reduce((somma, voce) => somma + voce.prezzo * voce.quantita, 0);
  const numeroArticoli = voci.reduce((somma, voce) => somma + voce.quantita, 0);

  /** Una voce può finire mentre è già nel carrello, per mano dell'altro turno:
   * meglio dirlo qui che vedersi rifiutare l'incasso dopo averlo battuto. */
  const avvisoEsaurito = useMemo(() => {
    const finita = selezionati.find((p) => p.esauritoSerata === SERATA_ID_OGGI);
    return finita ? `${finita.nome} è segnato come esaurito: toglilo dall'ordine.` : null;
  }, [selezionati]);

  function cambiaQuantita(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  function azzera() {
    setCarrello({});
    setErrore(null);
  }

  /** Il cliente ha pagato: l'ordine viene scritto e lo scontrino esce subito.
   * Si stampa da quello che risponde il server — codice e totale veri — non da
   * quello che c'era sullo schermo. */
  async function incassa() {
    setErrore(null);
    setMessaggio(null);
    setInCorso(true);
    try {
      const risultato = await creaOrdineBanco({
        serataId: SERATA_ID_OGGI,
        banco,
        items: Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita })),
      });
      const ordine: OrdineBanco = {
        id: risultato.data.ordineId,
        serataId: SERATA_ID_OGGI,
        banco,
        numero: risultato.data.numero,
        codice: risultato.data.codice,
        stato: 'incassato',
        items: voci,
        totale: risultato.data.totale,
        operatoreUid: '',
        operatoreNome: '',
        createdAt: { seconds: 0, nanoseconds: 0 },
        cancelledAt: null,
      };
      stampa([{ tipo: 'scontrinoBanco', ordine: ordinePerStampa(ordine) }]);
      setMessaggio(`${risultato.data.codice} incassato — ${euro(risultato.data.totale)}`);
      azzera();
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="nuovo-ordine">
      <div className="colonna-comanda">
        {prodotti.length === 0 ? (
          <p className="vuoto">
            Il menù {NOME_BANCO[banco]} è vuoto: riempilo nella scheda "Gestione Menù" qui sopra.
          </p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-ordine">
              <colgroup>
                <col className="col-piatto" />
                <col className="col-note" />
                <col className="col-prezzo" />
                <col className="col-quantita" />
                <col className="col-prezzo" />
              </colgroup>
              <thead>
                <tr>
                  <th>Voce</th>
                  <th>Note</th>
                  <th className="destra">Prezzo</th>
                  <th className="centro">Quantità</th>
                  <th className="destra">Totale</th>
                </tr>
              </thead>
              {perGruppo.map(({ gruppo, voci: vociGruppo }, indice) => (
                <tbody key={gruppo.id}>
                  <tr className="riga-categoria">
                    <td colSpan={5}>
                      <div
                        className="testata-portata"
                        style={{ ['--portata-colore' as string]: `var(--portata-${(indice % 5) + 1})` }}
                      >
                        <span className="nome-portata">{gruppo.nome}</span>
                      </div>
                    </td>
                  </tr>
                  {vociGruppo.map((prodotto) => {
                    const quantita = carrello[prodotto.id] ?? 0;
                    const finito = prodotto.esauritoSerata === SERATA_ID_OGGI;
                    return (
                      <tr
                        key={prodotto.id}
                        className={`${quantita > 0 ? 'selezionato' : ''}${finito ? ' esaurito' : ''}`.trim() || undefined}
                      >
                        <td className="colonna-piatto">
                          <span className="titolo-prodotto" title={prodotto.nome}>
                            {prodotto.nome}
                          </span>
                          {finito && <span className="targhetta-esaurito">esaurito</span>}
                        </td>
                        <td className="colonna-note" title={prodotto.note || undefined}>
                          {prodotto.note}
                        </td>
                        <td className="destra prezzo">{euro(prodotto.prezzo)}</td>
                        <td>
                          <div className="controlli-quantita">
                            <button
                              type="button"
                              aria-label={`Togli ${prodotto.nome}`}
                              disabled={quantita === 0}
                              onClick={() => cambiaQuantita(prodotto.id, -1)}
                            >
                              −
                            </button>
                            <span>{quantita}</span>
                            <button
                              type="button"
                              aria-label={`Aggiungi ${prodotto.nome}`}
                              disabled={finito}
                              onClick={() => cambiaQuantita(prodotto.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="destra prezzo">
                          {quantita > 0 ? (
                            <strong>{euro(prodotto.prezzo * quantita)}</strong>
                          ) : (
                            <span className="illimitato">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>

      <div className="colonna-anteprima">
        <ResocontoCliente
          voci={voci}
          totale={totale}
          titolo={`Scontrino ${NOME_BANCO[banco]}`}
          nota="Il conto da dire al cliente. Il numero dello scontrino lo assegna l'incasso."
          vuoto="Niente battuto — comincia dal menù qui a fianco."
        />

        <div className="riquadro piede-comanda">
          {avvisoEsaurito && <p className="errore">{avvisoEsaurito}</p>}
          {errore && <p className="errore">{errore}</p>}
          {messaggio && <p className="successo">{messaggio}</p>}

          <div className="tasti-cassa tasti-banco">
            <button
              type="button"
              className="bottone-principale bottone-conferma"
              disabled={numeroArticoli === 0 || inCorso || avvisoEsaurito !== null}
              onClick={incassa}
            >
              {inCorso ? 'Incasso in corso…' : 'Incassa e stampa'}
            </button>
            <button type="button" className="bottone-secondario" disabled={inCorso} onClick={azzera}>
              Azzera
            </button>
          </div>
          <p className="spiegazione">
            <strong>Incassa e stampa</strong> si preme a pagamento avvenuto: l'ordine finisce nell'archivio della
            serata, entra nell'incasso ed esce lo scontrino. Se hai sbagliato a battere, l'ordine si annulla dalla
            scheda "Ordini".
          </p>
        </div>
      </div>
    </div>
  );
}

/** Lo scontrino lo disegna FoglioComposto, che sa impaginare un ordine dei
 * tavoli. Un ordine di banco è più povero — niente tavolo, niente coperti,
 * nessun codice a barre — e qui prende la forma che quel foglio si aspetta.
 * I blocchi che non hanno niente da dire restano vuoti o spenti. */
export function ordinePerStampa(ordine: OrdineBanco) {
  return {
    id: ordine.id,
    serataId: ordine.serataId,
    numero: ordine.numero,
    cassa: null,
    codice: ordine.codice,
    codiceBarre: null,
    stato: 'completata' as const,
    tipo: 'cassa' as const,
    tavolo: null,
    coperti: null,
    items: ordine.items.map((voce) => ({ ...voce, settore: 'bar' as const })),
    totale: ordine.totale,
    createdAt: ordine.createdAt,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
  };
}
