import { useEffect, useRef, useState } from 'react';
import {
  SETTORE_DEL_BANCO,
  millisecondiTimestamp,
  type Ordine,
  type SottoOrdine,
} from '@sagra-mazzocco/shared';
import { useOrdiniAperti, useSottoOrdiniDaEvadere } from '../hooks';
import { messaggioErrore, segnaComandaStampata, segnaSottoOrdinePronto } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';
import { stampa } from './AreaStampa';

/** Le comande del bere che arrivano dalla cassa dei tavoli.
 *
 * Quando la cassa incassa un ordine, il cibo va in Distribuzione e la parte da
 * bere dello stesso cliente arriva qui, nello stesso momento: sono due metà
 * della stessa comanda, e portano lo stesso numero. Il foglio esce da solo
 * appena la comanda compare — chi sta al banco non deve premere niente — e
 * esce una volta sola anche con due schermi accesi, perché è il server a dire
 * a chi tocca stamparla.
 *
 * Questa scheda c'è solo al banco BEVANDE: BAR vende e basta. */
function oraDi(sottoOrdine: SottoOrdine): string {
  if (!sottoOrdine.createdAt) return '—';
  return new Date(millisecondiTimestamp(sottoOrdine.createdAt)).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Il foglio della comanda: FoglioComposto sa impaginare un ordine, non un
 * sotto-ordine, quindi la comanda prende qui la forma che lui si aspetta. Le
 * voci sono solo quelle del bere — è il senso di questo banco — mentre tavolo
 * e coperti arrivano dall'ordine a cui appartiene, perché il sotto-ordine non
 * se li porta dietro. */
function comandaPerStampa(comanda: SottoOrdine, ordine: Ordine | undefined): Ordine {
  return {
    id: comanda.id,
    serataId: comanda.serataId,
    numero: comanda.numeroOrdine,
    cassa: ordine?.cassa ?? null,
    codice: comanda.codice,
    codiceBarre: ordine?.codiceBarre ?? null,
    stato: 'in_evasione',
    tipo: ordine?.tipo ?? 'cassa',
    tavolo: ordine?.tavolo ?? null,
    coperti: ordine?.coperti ?? null,
    items: comanda.items.map((item) => ({ ...item, settore: SETTORE_DEL_BANCO, prezzo: 0 })),
    totale: 0,
    createdAt: comanda.createdAt,
    confirmedAt: null,
    completedAt: null,
    cancelledAt: null,
  };
}

export function ComandeBanco() {
  const comande = useSottoOrdiniDaEvadere().filter((s) => s.settore === SETTORE_DEL_BANCO);
  const ordini = useOrdiniAperti();
  const ordinePerId = new Map(ordini.map((ordine) => [ordine.id, ordine]));
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  // Chi ha già chiesto di stamparla in questa scheda: senza, ogni
  // aggiornamento dell'elenco rifarebbe la domanda al server.
  const richieste = useRef(new Set<string>());

  useEffect(() => {
    for (const comanda of comande) {
      if (comanda.stampataAt || richieste.current.has(comanda.id)) continue;
      richieste.current.add(comanda.id);
      segnaComandaStampata({ serataId: SERATA_ID_OGGI, sottoOrdineId: comanda.id })
        .then((risposta) => {
          if (risposta.data.daStampare)
            stampa([{ tipo: 'copiaCucina', ordine: comandaPerStampa(comanda, ordinePerId.get(comanda.ordineId)) }]);
        })
        .catch((err) => setErrore(messaggioErrore(err)));
    }
  }, [comande]);

  async function segnaPronta(comanda: SottoOrdine) {
    setErrore(null);
    setInCorso(comanda.id);
    try {
      await segnaSottoOrdinePronto({ serataId: SERATA_ID_OGGI, sottoOrdineId: comanda.id });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="comande-banco">
      <section className="riquadro">
        <h2>Comande dalla cassa ({comande.length})</h2>
        <p className="spiegazione">
          Il bere ordinato ai tavoli. Ogni comanda arriva qui nello stesso momento in cui il cibo dello stesso
          cliente arriva in Distribuzione, e il foglio esce da solo. <strong>Pronta</strong> la segna preparata:
          sparisce da qui e il vassoio si compone in Distribuzione.
        </p>

        {errore && <p className="errore">{errore}</p>}

        {comande.length === 0 ? (
          <p className="vuoto">Nessuna comanda da preparare: quando la cassa incassa un ordine col bere, compare qui.</p>
        ) : (
          /* Un elenco, una comanda per riga: sono poche voci per comanda e si
             leggono di corsa dall'alto in basso, come l'archivio degli ordini.
             A riquadri affiancati l'occhio doveva rimbalzare da una colonna
             all'altra per capire quale fosse arrivata prima. */
          <ul className="elenco-riepilogo elenco-comande">
            {comande.map((comanda) => (
              <li
                key={comanda.id}
                className={`riga-riepilogo stato-${comanda.stato === 'pronta' ? 'fatto' : 'corso'}`}
              >
                <div className="sommario-ordine">
                  <span className="numero">{comanda.codice}</span>
                  <span className="dettagli">
                    <span className="voci-in-riga">
                      {comanda.items.map((item) => (
                        <span key={item.prodottoId} className="voce-in-riga">
                          <strong>{item.quantita}×</strong> {item.nome}
                        </span>
                      ))}
                    </span>
                    <span className="coda-riga">
                      {oraDi(comanda)}
                      {/* Se il foglio è già uscito si vede: con più schermi
                          accesi lo stampa uno solo, e gli altri devono poterlo
                          sapere invece di premere Ristampa per sicurezza. */}
                      {comanda.stampataAt && <span className="targhetta-stampa">stampata</span>}
                    </span>
                    <span className={`targhetta-stato ${comanda.stato === 'pronta' ? 'fatto' : 'corso'}`}>
                      {comanda.stato === 'pronta' ? 'Pronta' : 'Da preparare'}
                    </span>
                  </span>
                  <span className="azioni-riga">
                    <button
                      type="button"
                      onClick={() =>
                        stampa([{ tipo: 'copiaCucina', ordine: comandaPerStampa(comanda, ordinePerId.get(comanda.ordineId)) }])
                      }
                    >
                      Ristampa
                    </button>
                    {comanda.stato === 'in_preparazione' && (
                      <button
                        type="button"
                        className="bottone-principale"
                        disabled={inCorso === comanda.id}
                        onClick={() => segnaPronta(comanda)}
                      >
                        {inCorso === comanda.id ? 'Segno…' : 'Pronta'}
                      </button>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
