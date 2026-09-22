import { useMemo, useState } from 'react';
import { useCategorie, useProdotti } from '../hooks';
import { creaOrdineBozza, messaggioErrore } from '../services/callables';
import { euro } from '../services/formato';
import { SERATA_ID_OGGI } from '../services/serata';
import { SelettoreCarattere } from './SelettoreCarattere';
import { SelettoreTema } from './SelettoreTema';

/** La pagina che il cliente apre inquadrando il QR. Non serve nessun account:
 * l'ordine parte come bozza e vale solo quando il cliente va in cassa, mostra
 * il numero e paga.
 *
 * Il tavolo lo dichiara il cliente: il QR è uno solo, uguale su tutti i
 * tavoli. Se arriva da un vecchio QR col tavolo dentro, il numero è già
 * compilato.
 *
 * Qui non si vedono né i settori né le porzioni rimaste: sono cose interne.
 * Di un piatto finito il cliente vede solo che è finito. */
export function MenuQr({ tavoloIniziale }: { tavoloIniziale: number | null }) {
  const categorie = useCategorie();
  const prodotti = useProdotti();
  const [carrello, setCarrello] = useState<Record<string, number>>({});
  const [tavolo, setTavolo] = useState(tavoloIniziale === null ? '' : String(tavoloIniziale));
  const [coperti, setCoperti] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviato, setInviato] = useState<{ numero: number; totale: number; tavolo: number } | null>(null);

  const perCategoria = useMemo(
    () =>
      categorie
        .map((categoria) => ({ categoria, lista: prodotti.filter((p) => p.categoriaId === categoria.id) }))
        .filter((gruppo) => gruppo.lista.length > 0),
    [categorie, prodotti]
  );

  const selezionati = prodotti.filter((p) => (carrello[p.id] ?? 0) > 0);
  const totale = selezionati.reduce((somma, p) => somma + p.prezzo * carrello[p.id], 0);
  const articoli = Object.values(carrello).reduce((s, q) => s + q, 0);
  const copertiValidi = Number.isInteger(Number(coperti)) && Number(coperti) > 0;
  // Il tavolo serve all'inserviente per sapere dove portare il vassoio: senza
  // non si invia niente.
  const tavoloValido = Number.isInteger(Number(tavolo)) && Number(tavolo) > 0;

  function cambia(prodottoId: string, delta: number) {
    setCarrello((prec) => {
      const nuova = Math.max(0, (prec[prodottoId] ?? 0) + delta);
      const copia = { ...prec, [prodottoId]: nuova };
      if (nuova === 0) delete copia[prodottoId];
      return copia;
    });
  }

  async function invia() {
    setErrore(null);
    setInCorso(true);
    try {
      const risultato = await creaOrdineBozza({
        serataId: SERATA_ID_OGGI,
        tavolo: Number(tavolo),
        coperti: Number(coperti),
        items: Object.entries(carrello).map(([prodottoId, quantita]) => ({ prodottoId, quantita })),
      });
      setInviato({ numero: risultato.data.numero, totale: risultato.data.totale, tavolo: Number(tavolo) });
      setCarrello({});
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  if (inviato) {
    return (
      <div className="menu-qr">
        <header className="testata-qr">
          <span className="occhiello">Sagra di Mazzocco</span>
          <span className="tavolo-qr">Tavolo {inviato.tavolo}</span>
        </header>
        <section className="riquadro numero-inviato">
          <h1>Ordine inviato</h1>
          <p className="spiegazione">Vai in cassa, mostra questo numero e paga. L'ordine parte da lì.</p>
          <p className="numero-grande">{inviato.numero}</p>
          <p className="totale">
            Da pagare <strong>{euro(inviato.totale)}</strong>
          </p>
          <button type="button" className="bottone-secondario" onClick={() => setInviato(null)}>
            Ordina altro
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="menu-qr">
      <header className="testata-qr">
        <span className="occhiello">Sagra di Mazzocco</span>
        <span className="tavolo-qr">{tavoloValido ? `Tavolo ${Number(tavolo)}` : 'Il menù'}</span>
        <SelettoreCarattere />
        <SelettoreTema />
      </header>

      {prodotti.length === 0 ? (
        <p className="vuoto">Il menù non è ancora disponibile.</p>
      ) : (
        perCategoria.map(({ categoria, lista }, indice) => (
          <section key={categoria.id} className="portata-qr">
            <h2
              className="testata-portata"
              style={{ ['--portata-colore' as string]: `var(--portata-${(indice % 5) + 1})` }}
            >
              {categoria.nome}
            </h2>
            <ul className="piatti-qr">
              {lista.map((prodotto) => {
                const quantita = carrello[prodotto.id] ?? 0;
                const finito = prodotto.esauritoSerata === SERATA_ID_OGGI;
                return (
                  <li key={prodotto.id} className={finito ? 'esaurito' : undefined}>
                    <div className="descrizione">
                      <span className="titolo-prodotto">{prodotto.nome}</span>
                      {/* Le targhette vanno su una riga loro: accanto al nome,
                          su uno schermo stretto, finivano sopra al prezzo. */}
                      {(finito || prodotto.novita) && (
                        <span className="targhette">
                          {finito ? (
                            <span className="targhetta-esaurito">esaurito</span>
                          ) : (
                            <span className="targhetta-novita">novità</span>
                          )}
                        </span>
                      )}
                      {prodotto.note && <span className="note">{prodotto.note}</span>}
                    </div>
                    <span className="prezzo">{euro(prodotto.prezzo)}</span>
                    <div className="controlli-quantita">
                      <button
                        type="button"
                        aria-label={`Togli ${prodotto.nome}`}
                        disabled={quantita === 0}
                        onClick={() => cambia(prodotto.id, -1)}
                      >
                        −
                      </button>
                      <span>{quantita}</span>
                      <button
                        type="button"
                        aria-label={`Aggiungi ${prodotto.nome}`}
                        disabled={finito}
                        onClick={() => cambia(prodotto.id, 1)}
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {/* La barra in fondo resta visibile mentre si scorre il menù. */}
      <div className="barra-ordine">
        <div className="campi-cliente">
          <label>
            Numero del tavolo
            <input
              type="number"
              min="1"
              placeholder="—"
              value={tavolo}
              onChange={(e) => setTavolo(e.target.value)}
            />
          </label>
          <label>
            Quante persone
            <input type="number" min="1" placeholder="—" value={coperti} onChange={(e) => setCoperti(e.target.value)} />
          </label>
        </div>
        <p className="totale">
          {articoli} {articoli === 1 ? 'articolo' : 'articoli'} · <strong>{euro(totale)}</strong>
        </p>
        {errore && <p className="errore">{errore}</p>}
        <button
          type="button"
          className="bottone-principale"
          disabled={articoli === 0 || !tavoloValido || !copertiValidi || inCorso}
          onClick={invia}
        >
          {inCorso ? 'Invio in corso…' : 'Invia alla cassa'}
        </button>
        {articoli > 0 && (!tavoloValido || !copertiValidi) && (
          <p className="avviso-campi">
            {!tavoloValido
              ? 'Scrivi il numero del tavolo dove sei seduto: lo trovi sul cartello del tavolo.'
              : 'Scrivi quante persone siete.'}
          </p>
        )}
      </div>
    </div>
  );
}
