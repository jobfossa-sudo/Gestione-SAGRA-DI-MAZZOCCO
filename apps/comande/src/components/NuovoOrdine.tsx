import { useMemo, useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useCategorie, useDisponibilita, useLetteraCassa, useOrdiniAperti, useProdotti, useUtenteAutenticato } from '../hooks';
import { creaOrdineCassa, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { AnteprimaBiglietto } from './AnteprimaBiglietto';
import { Passo, PassiOrdine } from './PassiOrdine';

/** Colonne della tabella: serve alle intestazioni di portata, che occupano
 * un'unica cella a tutta larghezza. */
const COLONNE = 6;

export function NuovoOrdine() {
  const categorie = useCategorie();
  // I piatti finiti restano nell'elenco, barrati: la cassiera deve poter dire
  // al cliente "quello è finito" invece di cercare un piatto scomparso.
  const prodotti = useProdotti();
  const disponibilita = useDisponibilita();
  const { utente } = useUtenteAutenticato();
  const letteraCassa = useLetteraCassa(utente?.uid);
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [tavolo, setTavolo] = useState('');
  const [coperti, setCoperti] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);
  /** L'ordine appena confermato, che aspetta l'incasso: finché è qui prende il
   * posto del carrello, così la cassiera non batte un altro ordine per sbaglio
   * mentre il cliente sta pagando. */
  const [ordineDaIncassareId, setOrdineDaIncassareId] = useState<string | null>(null);
  /** Vero solo se la conferma è appena avvenuta qui: è quella che fa partire
   * la stampa. Riprendendo un ordine già confermato non si ristampa niente. */
  const [confermatoQui, setConfermatoQui] = useState(false);
  const ordiniAperti = useOrdiniAperti();
  const ordineDaIncassare = ordiniAperti.find((o) => o.id === ordineDaIncassareId && o.stato === 'da_pagare') ?? null;
  /** Dalla conferma all'incasso il banco è impegnato: il menù resta sotto gli
   * occhi con l'ordine battuto sopra, ma non si tocca più, così non si
   * aggiunge un piatto a un conto già stampato. */
  const bloccato = ordineDaIncassareId !== null;

  // Alla cassa il menù si legge per portate, come sul cartello: il settore che
  // prepara il piatto qui non serve.
  const prodottiPerCategoria = useMemo(
    () =>
      categorie
        .map((categoria) => ({
          categoria,
          lista: prodotti.filter((p) => p.categoriaId === categoria.id),
        }))
        .filter((gruppo) => gruppo.lista.length > 0),
    [categorie, prodotti]
  );

  const selezionati = useMemo(
    () => prodotti.filter((p) => (carrello[p.id] ?? 0) > 0),
    [prodotti, carrello]
  );

  /** Porzioni ancora vendibili stasera: null quando il piatto non ha limite.
   * Il numero lo vede solo chi sta in cassa, mai il cliente. */
  function porzioniRimaste(prodottoId: string): number | null {
    const riga = disponibilita.get(prodottoId);
    if (!riga || riga.porzioniMassime === null) return null;
    return Math.max(0, riga.porzioniMassime - riga.venduti);
  }

  const totale = selezionati.reduce((somma, p) => somma + p.prezzo * carrello[p.id], 0);
  const numeroArticoli = Object.values(carrello).reduce((s, q) => s + q, 0);
  // Tavolo e coperti finiscono sulla copia cucina: senza, l'inserviente non
  // sa dove portare il vassoio.
  const tavoloValido = Number.isInteger(Number(tavolo)) && Number(tavolo) > 0;
  const copertiValidi = Number.isInteger(Number(coperti)) && Number(coperti) > 0;
  const mancaTavolo = numeroArticoli > 0 && (!tavoloValido || !copertiValidi);

  /** Un piatto può finire mentre è già nel carrello, per mano di un'altra
   * cassa: meglio dirlo qui che vedersi rifiutare l'ordine dopo averlo
   * battuto. Non si vendono mezzi ordini, quindi si blocca l'invio. */
  const avvisoPorzioni = useMemo(() => {
    if (bloccato) return null;
    for (const p of selezionati) {
      const quantita = carrello[p.id];
      if (p.esauritoSerata === SERATA_ID_OGGI) return `${p.nome} è appena finito: toglilo dall'ordine.`;
      const riga = disponibilita.get(p.id);
      if (!riga || riga.porzioniMassime === null) continue;
      const rimaste = Math.max(0, riga.porzioniMassime - riga.venduti);
      if (quantita > rimaste) {
        return rimaste === 0
          ? `${p.nome} è appena finito: toglilo dall'ordine.`
          : `Di ${p.nome} ${rimaste === 1 ? 'resta solo 1 porzione' : `restano solo ${rimaste} porzioni`}: correggi la quantità.`;
      }
    }
    return null;
  }, [selezionati, carrello, disponibilita, bloccato]);

  /** L'ordine come sarà una volta confermato, costruito dal carrello mentre lo
   * si batte: serve solo all'anteprima del biglietto. I campi che riempie il
   * server restano vuoti — il numero di comanda e il codice a barre arrivano
   * con la conferma — e l'anteprima lascia il loro posto in bianco. Dopo la
   * conferma non serve più: al suo posto si mostra l'ordine vero. */
  const ordineProvvisorio: Ordine = useMemo(
    () => ({
      id: 'anteprima',
      serataId: SERATA_ID_OGGI,
      numero: 0,
      cassa: letteraCassa ?? null,
      codice: null,
      codiceBarre: null,
      stato: 'bozza',
      tipo: 'cassa',
      tavolo: tavoloValido ? Number(tavolo) : null,
      coperti: copertiValidi ? Number(coperti) : null,
      items: selezionati.map((prodotto) => ({
        prodottoId: prodotto.id,
        nome: prodotto.nome,
        settore: prodotto.settore,
        prezzo: prodotto.prezzo,
        quantita: carrello[prodotto.id],
      })),
      totale,
      createdAt: { seconds: 0, nanoseconds: 0 },
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
    }),
    [letteraCassa, tavolo, tavoloValido, coperti, copertiValidi, selezionati, carrello, totale]
  );

  /** L'ordine ha lasciato il banco — incassato o annullato: si ricomincia da
   * zero. */
  function liberaCassa() {
    setOrdineDaIncassareId(null);
    setConfermatoQui(false);
    setCarrello({});
    setTavolo('');
    setCoperti('');
  }

  /** Un ordine confermato, stampato e mai incassato rimasto in giro: succede
   * se la pagina si ricarica o il browser si chiude mentre il cliente paga.
   * Va segnalato, perché il banco è l'unico posto dell'app in cui un ordine
   * della cassa compare: senza, non si potrebbe più né incassarlo né
   * annullarlo. Si segnala e basta, senza riprenderlo d'ufficio: chi apre la
   * schermata di solito ha un cliente davanti, e si troverebbe il banco
   * occupato da un ordine di un'ora prima. */
  const rimastiInSospeso =
    ordineDaIncassareId === null
      ? ordiniAperti.filter((o) => o.stato === 'da_pagare' && o.tipo === 'cassa' && o.cassa === letteraCassa)
      : [];
  // Il più recente: è quello che con ogni probabilità si stava incassando
  // quando la pagina si è ricaricata. Se ce ne fosse più d'uno si va a ritroso,
  // uno alla volta, man mano che vengono sistemati.
  const rimastoInSospeso = rimastiInSospeso[rimastiInSospeso.length - 1];

  function cambiaQuantita(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  /** Conferma: l'ordine prende il numero di comanda e il foglio per il cliente
   * va in stampa. Ai reparti non arriva niente finché non si incassa. */
  async function confermaOrdine() {
    setErrore(null);
    setMessaggioSuccesso(null);
    setInCorso(true);
    try {
      const items = Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita }));
      const risultato = await creaOrdineCassa({
        serataId: SERATA_ID_OGGI,
        items,
        tavolo: Number(tavolo),
        coperti: Number(coperti),
      });
      setConfermatoQui(true);
      setOrdineDaIncassareId(risultato.data.ordineId);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="nuovo-ordine">
      <div className="colonna-comanda">
        <div className="riquadro testata-comanda">
          <div className="campi-tavolo">
            <label>
              Tavolo
              <input
                type="number"
                min="1"
                placeholder="—"
                required
                disabled={bloccato}
                aria-invalid={mancaTavolo && !tavoloValido}
                value={tavolo}
                onChange={(e) => setTavolo(e.target.value)}
              />
            </label>
            <label>
              Coperti
              <input
                type="number"
                min="1"
                placeholder="—"
                required
                disabled={bloccato}
                aria-invalid={mancaTavolo && !copertiValidi}
                value={coperti}
                onChange={(e) => setCoperti(e.target.value)}
              />
            </label>
          </div>
          {letteraCassa && <span className="targhetta-cassa">Cassa {letteraCassa}</span>}
        </div>

        {rimastoInSospeso && (
          <p className="avviso-rimasto">
            <span>
              L'ordine <strong>{rimastoInSospeso.codice}</strong> è confermato e stampato, ma non risulta
              incassato: {euro(rimastoInSospeso.totale)}, tavolo {rimastoInSospeso.tavolo ?? '—'}.
            </span>
            <button type="button" onClick={() => setOrdineDaIncassareId(rimastoInSospeso.id)}>
              Riprendilo
            </button>
          </p>
        )}

        {prodotti.length === 0 ? (
          <p className="vuoto">Nessun prodotto disponibile.</p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-ordine">
              <colgroup>
                <col className="col-piatto" />
                <col className="col-note" />
                <col className="col-prezzo" />
                <col className="col-rimaste" />
                <col className="col-quantita" />
                <col className="col-totale" />
              </colgroup>
              <thead>
                <tr>
                  <th>Piatto</th>
                  <th>Note</th>
                  <th className="destra">Prezzo</th>
                  <th className="centro">Rimaste</th>
                  <th className="centro">Quantità</th>
                  <th className="destra">Totale</th>
                </tr>
              </thead>
              {prodottiPerCategoria.map(({ categoria, lista }, indice) => (
                <tbody key={categoria.id}>
                  <tr className="riga-categoria">
                    <td colSpan={COLONNE}>
                      {/* I colori girano a rotazione: le portate le decide
                          l'amministratore, non si possono fissare a una a una. */}
                      <div
                        className="testata-portata"
                        style={{ ['--portata-colore' as string]: `var(--portata-${(indice % 5) + 1})` }}
                      >
                        <span className="nome-portata">{categoria.nome}</span>
                      </div>
                    </td>
                  </tr>
                  {lista.map((prodotto) => {
                    const quantita = carrello[prodotto.id] ?? 0;
                    const rimaste = porzioniRimaste(prodotto.id);
                    const finito = prodotto.esauritoSerata === SERATA_ID_OGGI || rimaste === 0;
                    // Non si vendono porzioni che non ci sono: il "+" si ferma
                    // da solo, così l'ordine non viene rifiutato dopo averlo
                    // battuto.
                    const alMassimo = rimaste !== null && quantita >= rimaste;
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
                        <td className="centro">
                          {finito ? (
                            <span className="illimitato">0</span>
                          ) : rimaste === null ? (
                            <span className="illimitato">—</span>
                          ) : (
                            <span className={`rimaste${rimaste <= 3 ? ' poche' : ''}`}>{rimaste}</span>
                          )}
                        </td>
                        <td>
                          <div className="controlli-quantita">
                            <button
                              type="button"
                              aria-label={`Togli ${prodotto.nome}`}
                              disabled={bloccato || quantita === 0}
                              onClick={() => cambiaQuantita(prodotto.id, -1)}
                            >
                              −
                            </button>
                            <span>{quantita}</span>
                            <button
                              type="button"
                              aria-label={`Aggiungi ${prodotto.nome}`}
                              disabled={bloccato || finito || alMassimo}
                              title={alMassimo && !finito ? 'Non ci sono altre porzioni' : undefined}
                              onClick={() => cambiaQuantita(prodotto.id, 1)}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="destra prezzo">
                          {quantita > 0 ? <strong>{euro(prodotto.prezzo * quantita)}</strong> : <span className="illimitato">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>
        )}

        {/* In fondo alla colonna il totale e i due passi: si arriva qui dopo
            aver battuto l'ordine, ed è l'ultima cosa che si guarda. */}
        <div className="riquadro piede-comanda">
          {letteraCassa === null && (
            <p className="errore">
              Al tuo account non è stata assegnata la lettera della cassa (A, B…): chiedi all'amministratore di
              impostarla nell'app Utenti, altrimenti gli ordini non partono.
            </p>
          )}
          {avvisoPorzioni && <p className="errore">{avvisoPorzioni}</p>}
          {mancaTavolo && <p className="avviso-campi">Scrivi il tavolo e i coperti prima di confermare.</p>}
          {errore && <p className="errore">{errore}</p>}
          {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}

          <p className="totale">
            {bloccato ? 'Da incassare' : 'Totale'}{' '}
            <strong>{euro(ordineDaIncassare ? ordineDaIncassare.totale : totale)}</strong>
          </p>

          {ordineDaIncassare ? (
            // Da qui in poi comanda la scala condivisa: è la stessa di
            // "Conferma ordine", con ristampa e annullamento al seguito.
            <PassiOrdine
              ordine={ordineDaIncassare}
              stampaSubito={confermatoQui}
              onFatto={(testo) => {
                setMessaggioSuccesso(testo);
                liberaCassa();
              }}
            />
          ) : ordineDaIncassareId !== null ? (
            <p className="spiegazione">Sto preparando il foglio…</p>
          ) : (
            <div className="passi-ordine">
              <Passo numero={1} stato="ora">
                <button
                  type="button"
                  className="bottone-principale"
                  disabled={numeroArticoli === 0 || inCorso || avvisoPorzioni !== null || mancaTavolo || !letteraCassa}
                  onClick={confermaOrdine}
                >
                  {inCorso ? 'Conferma in corso…' : 'Conferma e stampa'}
                </button>
                <p className="spiegazione">
                  La conferma dà il numero di comanda e stampa il foglio per il cliente.
                </p>
              </Passo>
              <Passo numero={2} stato="dopo">
                <button type="button" className="bottone-principale" disabled>
                  Invia ordine
                </button>
                <p className="spiegazione">Si accende dopo la conferma, quando il cliente ha pagato.</p>
              </Passo>
            </div>
          )}
        </div>
      </div>

      {/* Lo scontrino: l'elenco dei piatti sta qui e solo qui. Prima compariva
          anche in un riepilogo a fianco, che diceva le stesse cose due volte. */}
      <div className="colonna-anteprima">
        <AnteprimaBiglietto
          tipo="resoconto"
          ordine={ordineDaIncassare ?? ordineProvvisorio}
          nota={
            ordineDaIncassare
              ? 'Il foglio appena stampato per il cliente.'
              : 'Il foglio per il cliente, come sarà alla conferma. Numero di comanda e codice a barre li assegna la conferma.'
          }
        />
      </div>
    </div>
  );
}
