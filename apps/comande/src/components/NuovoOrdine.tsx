import { useMemo, useState } from 'react';
import { useCategorie, useDisponibilita, useProdotti } from '../hooks';
import { creaOrdineCassa, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

function euro(valore: number): string {
  return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

export function NuovoOrdine() {
  const categorie = useCategorie();
  // I piatti finiti restano nell'elenco, barrati: la cassiera deve poter dire
  // al cliente "quello è finito" invece di cercare un piatto scomparso.
  const prodotti = useProdotti();
  const disponibilita = useDisponibilita();
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [tavolo, setTavolo] = useState('');
  const [coperti, setCoperti] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

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

  /** Un piatto può finire mentre è già nel carrello, per mano di un'altra
   * cassa: meglio dirlo qui che vedersi rifiutare l'ordine dopo averlo
   * battuto. Non si vendono mezzi ordini, quindi si blocca l'invio. */
  const avvisoPorzioni = useMemo(() => {
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
  }, [selezionati, carrello, disponibilita]);

  function cambiaQuantita(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  async function inviaOrdine() {
    setErrore(null);
    setMessaggioSuccesso(null);
    setInCorso(true);
    try {
      const items = Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita }));
      const risultato = await creaOrdineCassa({
        serataId: SERATA_ID_OGGI,
        items,
        tavolo: tavolo ? Number(tavolo) : null,
        coperti: coperti ? Number(coperti) : null,
      });
      setMessaggioSuccesso(
        `Ordine n. ${risultato.data.numero} inviato ai reparti — ${euro(risultato.data.totale)}`
      );
      setCarrello({});
      setTavolo('');
      setCoperti('');
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="nuovo-ordine">
      <div className="colonna-menu">
        {prodottiPerCategoria.map(({ categoria, lista }, indice) => (
          <div key={categoria.id} className="gruppo-reparto">
            <div className="intestazione-reparto">
              {/* I colori girano a rotazione: le portate le decide
                  l'amministratore, quindi non si possono fissare a una a una. */}
              <span className="pallino" style={{ ['--reparto-colore' as string]: `var(--portata-${(indice % 5) + 1})` }} />
              <h2>{categoria.nome}</h2>
            </div>
            <div className="griglia-prodotti">
              {lista.map((prodotto) => {
                const quantita = carrello[prodotto.id] ?? 0;
                const rimaste = porzioniRimaste(prodotto.id);
                const finito = prodotto.esauritoSerata === SERATA_ID_OGGI || rimaste === 0;
                // Non si vendono porzioni che non ci sono: il "+" si ferma da
                // solo, così l'ordine non viene rifiutato dopo averlo battuto.
                const alMassimo = rimaste !== null && quantita >= rimaste;
                return (
                  <div
                    key={prodotto.id}
                    className={`riga-prodotto${quantita > 0 ? ' selezionato' : ''}${finito ? ' esaurito' : ''}`}
                  >
                    <span className="nome-prodotto">
                      <span className="titolo-prodotto">{prodotto.nome}</span>
                      <small>
                        {euro(prodotto.prezzo)}
                        {prodotto.note && <span className="note-prodotto"> · {prodotto.note}</span>}
                      </small>
                      {finito ? (
                        <span className="targhetta-esaurito">esaurito</span>
                      ) : (
                        rimaste !== null && (
                          <small className={`rimaste${rimaste <= 3 ? ' poche' : ''}`}>
                            {rimaste === 1 ? 'resta 1 porzione' : `restano ${rimaste} porzioni`}
                          </small>
                        )
                      )}
                    </span>
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
                        disabled={finito || alMassimo}
                        title={alMassimo && !finito ? 'Non ci sono altre porzioni' : undefined}
                        onClick={() => cambiaQuantita(prodotto.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {prodotti.length === 0 && <p className="vuoto">Nessun prodotto disponibile.</p>}
      </div>

      <div className="colonna-riepilogo">
        <h2>Riepilogo ordine</h2>

        {selezionati.length === 0 ? (
          <p className="carrello-vuoto">Tocca i prodotti per aggiungerli all'ordine.</p>
        ) : (
          <ul className="carrello">
            {selezionati.map((p) => {
              const quantita = carrello[p.id];
              const rimaste = porzioniRimaste(p.id);
              const troppe = p.esauritoSerata === SERATA_ID_OGGI || (rimaste !== null && quantita > rimaste);
              return (
                <li key={p.id} className={troppe ? 'non-disponibile' : undefined}>
                  <span>
                    <span className="quantita">{quantita}×</span>
                    {p.nome}
                  </span>
                  <span className="prezzo">{euro(p.prezzo * quantita)}</span>
                </li>
              );
            })}
          </ul>
        )}

        {avvisoPorzioni && <p className="errore">{avvisoPorzioni}</p>}

        <div className="campi-tavolo">
          <label>
            Tavolo
            <input type="number" min="1" placeholder="—" value={tavolo} onChange={(e) => setTavolo(e.target.value)} />
          </label>
          <label>
            Coperti
            <input type="number" min="1" placeholder="—" value={coperti} onChange={(e) => setCoperti(e.target.value)} />
          </label>
        </div>

        <p className="totale">
          Totale <strong>{euro(totale)}</strong>
        </p>

        {errore && <p className="errore">{errore}</p>}
        {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}

        <button
          type="button"
          className="bottone-principale"
          disabled={numeroArticoli === 0 || inCorso || avvisoPorzioni !== null}
          onClick={inviaOrdine}
        >
          {inCorso ? 'Invio in corso…' : 'Conferma e invia'}
        </button>
      </div>
    </div>
  );
}
