import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useCategorie, useDisponibilita, useLetteraCassa, useOrdiniAperti, useProdotti, useUtenteAutenticato } from '../hooks';
import { confermaOrdine, creaOrdineCassa, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { AnteprimaBiglietto } from './AnteprimaBiglietto';
import { stampa } from './AreaStampa';

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
  /** Numero digitato nella casella per richiamare un ordine dal QR. */
  const [numeroQr, setNumeroQr] = useState('');
  /** L'ordine arrivato dal tavolo che si sta incassando. Quando c'è, il
   * carrello lo ricopia ma non si tocca: le voci le ha scelte il cliente e il
   * server confermerà quelle, non quelle che si vedono qui. */
  const [bozza, setBozza] = useState<Ordine | null>(null);
  /** L'ordine appena confermato, di cui si aspetta il documento vero per
   * stamparne il foglio definitivo con numero e codice a barre. */
  const [daStampareId, setDaStampareId] = useState<string | null>(null);
  const ordiniAperti = useOrdiniAperti();
  const bloccato = bozza !== null;

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

  /** Il banco torna vuoto: si ricomincia da zero. Non c'è niente da disfare in
   * archivio, perché finché non si conferma non è stato scritto niente. */
  function azzera() {
    setCarrello({});
    setTavolo('');
    setCoperti('');
    setNumeroQr('');
    setBozza(null);
    setErrore(null);
  }

  function cambiaQuantita(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  /** Si digita il numero che il cliente ha sullo schermo del telefono e il suo
   * ordine viene in mano alla cassa. Le voci le ha scelte lui e non si toccano:
   * il server confermerà quelle che ha in archivio, non quelle che si vedono
   * qui, quindi lasciarle modificare sarebbe una bugia. */
  function richiamaBozza(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggioSuccesso(null);
    const cercato = Number(numeroQr);
    const dalTavolo = ordiniAperti.filter((o) => o.tipo === 'qr');
    const trovata = dalTavolo.find((o) => o.numero === cercato && o.stato === 'bozza');
    if (!trovata) {
      const gia = dalTavolo.find((o) => o.numero === cercato);
      setErrore(
        gia
          ? `L'ordine n. ${cercato} è già passato in cassa: lo trovi nella scheda Ordini.`
          : `Nessun ordine dal tavolo con numero ${cercato} in questa serata. Controlla il numero sullo schermo del cliente.`
      );
      return;
    }
    setBozza(trovata);
    setCarrello(Object.fromEntries(trovata.items.map((item) => [item.prodottoId, item.quantita])));
    setTavolo(String(trovata.tavolo ?? ''));
    setCoperti(String(trovata.coperti ?? ''));
    setNumeroQr('');
  }

  /** Il conto da far vedere al cliente prima che paghi. Non è il foglio
   * definitivo: non ha numero di comanda né codice a barre, perché l'ordine
   * ancora non esiste. Si può ristampare quante volte si vuole. */
  function stampaResoconto() {
    stampa([{ tipo: 'resoconto', ordine: ordineProvvisorio }]);
  }

  /** Il cliente ha pagato. Qui succede tutto in una volta: l'ordine viene
   * scritto, le porzioni scalate, le comande partono verso i reparti. Poi si
   * stampa il foglio definitivo e il banco torna libero. */
  async function conferma() {
    setErrore(null);
    setMessaggioSuccesso(null);
    setInCorso(true);
    try {
      const risultato = bozza
        ? await confermaOrdine({ serataId: SERATA_ID_OGGI, numero: bozza.numero })
        : await creaOrdineCassa({
            serataId: SERATA_ID_OGGI,
            items: Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita })),
            tavolo: Number(tavolo),
            coperti: Number(coperti),
          });
      setDaStampareId(risultato.data.ordineId);
      setMessaggioSuccesso(`Ordine ${risultato.data.codice} incassato e inviato ai reparti — ${euro(risultato.data.totale)}`);
      azzera();
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  /** Il foglio definitivo si stampa dal documento vero, non da quello che c'era
   * sullo schermo: numero di comanda e codice a barre li mette il server, e il
   * cliente deve avere in mano quello che è stato davvero registrato. Arriva
   * con un attimo di ritardo, appena l'ordine compare tra quelli in corso. */
  const giaStampati = useRef(new Set<string>());
  useEffect(() => {
    if (!daStampareId || giaStampati.current.has(daStampareId)) return;
    // Deve avere il numero di comanda addosso. Un ordine arrivato dal tavolo
    // era già in elenco come bozza, e senza questo controllo si stamperebbe
    // quella versione lì — senza numero e senza codice a barre — invece di
    // aspettare che arrivi l'aggiornamento con la conferma.
    const ordine = ordiniAperti.find((o) => o.id === daStampareId && o.codice);
    if (!ordine) return;
    giaStampati.current.add(daStampareId);
    setDaStampareId(null);
    stampa([{ tipo: 'resoconto', ordine }]);
  }, [daStampareId, ordiniAperti]);

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
          {/* Il cliente che ha ordinato dal tavolo arriva con un numero sullo
              schermo del telefono: si digita qui e il suo ordine viene in
              mano alla cassa, senza cambiare schermata. */}
          <form className="richiama-qr" onSubmit={richiamaBozza}>
            <label>
              Ordine dal QR n.
              <input
                type="number"
                min="1"
                placeholder="000"
                value={numeroQr}
                onChange={(e) => setNumeroQr(e.target.value)}
                disabled={bloccato}
              />
            </label>
            <button type="submit" disabled={bloccato || !numeroQr.trim()}>
              Richiama
            </button>
          </form>

          {letteraCassa && <span className="targhetta-cassa">Cassa {letteraCassa}</span>}
        </div>

        {bozza && (
          <p className="avviso-dal-tavolo">
            <span>
              Ordine <strong>n. {bozza.numero}</strong> arrivato dal tavolo {bozza.tavolo ?? '—'}: le voci le ha
              scelte il cliente e non si cambiano.
            </span>
            <button type="button" onClick={azzera}>
              Lascialo stare
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

        {/* In fondo alla colonna il totale e i tre tasti: il conto da far
            vedere, l'incasso e il ripensamento. */}
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
            Totale <strong>{euro(totale)}</strong>
          </p>

          <div className="tasti-cassa">
            <button type="button" disabled={numeroArticoli === 0 || inCorso} onClick={stampaResoconto}>
              Stampa resoconto
            </button>
            <button
              type="button"
              className="bottone-principale bottone-conferma"
              disabled={
                numeroArticoli === 0 || inCorso || avvisoPorzioni !== null || mancaTavolo || !letteraCassa
              }
              onClick={conferma}
            >
              {inCorso ? 'Conferma in corso…' : 'Conferma ordine'}
            </button>
            <button type="button" className="bottone-secondario" disabled={inCorso} onClick={azzera}>
              Azzera
            </button>
          </div>
          <p className="spiegazione">
            <strong>Stampa resoconto</strong> dà al cliente il conto da controllare, senza registrare niente.{' '}
            <strong>Conferma ordine</strong> si preme a pagamento avvenuto: l'ordine parte verso i reparti e
            esce il foglio definitivo.
          </p>
        </div>
      </div>

      {/* Lo scontrino: l'elenco dei piatti sta qui e solo qui. Prima compariva
          anche in un riepilogo a fianco, che diceva le stesse cose due volte. */}
      <div className="colonna-anteprima">
        <AnteprimaBiglietto
          tipo="resoconto"
          ordine={ordineProvvisorio}
          nota="Il conto come uscirà dalla stampante. Numero di comanda e codice a barre li assegna la conferma, quindi qui il loro posto resta vuoto."
        />
      </div>
    </div>
  );
}
