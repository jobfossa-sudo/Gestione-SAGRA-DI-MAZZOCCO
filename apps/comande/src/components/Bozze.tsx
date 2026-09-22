import { useState } from 'react';
import type { Ordine } from '@sagra-mazzocco/shared';
import { useOrdiniAperti } from '../hooks';
import { euro } from '../services/formato';
import { PassiOrdine, TestataOrdine, VociOrdine } from './PassiOrdine';

/** Una riga dell'elenco di sinistra. Gli ordini arrivati dal tavolo NON si
 * aprono con un tocco: il numero va digitato a mano, è la barriera contro il
 * tasto premuto per sbaglio. Quelli già confermati sì: il controllo è già
 * stato fatto, e così una cassa che si è ricaricata li ritrova. */
function RigaBozza({
  ordine,
  aperto,
  onApri,
}: {
  ordine: Ordine;
  aperto: boolean;
  onApri: (() => void) | null;
}) {
  const articoli = ordine.items.reduce((somma, item) => somma + item.quantita, 0);
  const daPagare = ordine.stato === 'da_pagare';

  return (
    <li className={aperto ? 'richiamato' : undefined}>
      <span className="numero">{daPagare ? ordine.codice : `n. ${ordine.numero}`}</span>
      <span className="dettagli">
        <span>
          Tavolo {ordine.tavolo ?? '—'} · {articoli} {articoli === 1 ? 'articolo' : 'articoli'}
          <span className={daPagare ? 'targhetta-stato incassare' : 'targhetta-stato tavolo'}>
            {daPagare ? 'da incassare' : 'dal tavolo'}
          </span>
        </span>
        <span className="voci">{ordine.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</span>
      </span>
      <span className="prezzo">{euro(ordine.totale)}</span>
      {onApri ? (
        <button type="button" onClick={onApri}>
          Apri
        </button>
      ) : (
        <span className="vuoto-cella" aria-hidden="true" />
      )}
    </li>
  );
}

/** Tutto quello che la cassa ha ancora in mano: gli ordini arrivati dal QR dei
 * tavoli e quelli già confermati che aspettano di essere pagati. Un elenco
 * solo, perché a fine serata deve arrivare a zero, e a destra l'ordine su cui
 * si sta lavorando con i suoi due passi. */
export function Bozze() {
  // Solo gli ordini arrivati dal telefono dei clienti. Quelli battuti al
  // banco non compaiono qui: nascono già in mano alla cassa e da lì vanno ai
  // reparti, senza mai passare per questo elenco.
  const dalTavolo = useOrdiniAperti().filter((o) => o.tipo === 'qr');
  const bozze = dalTavolo.filter((o) => o.stato === 'bozza');
  const daPagare = dalTavolo.filter((o) => o.stato === 'da_pagare');
  // Prima i nuovi arrivi dal tavolo, poi chi sta pagando: è l'ordine in cui
  // le cose capitano al banco.
  const elenco = [...bozze, ...daPagare];

  const [numero, setNumero] = useState('');
  const [apertoId, setApertoId] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  const aperto = elenco.find((o) => o.id === apertoId) ?? null;

  /** Si digita il numero mostrato sul telefono del cliente e si richiama
   * l'ordine. Si cerca solo tra le bozze: i numeri dal QR e i codici di
   * comanda sono due serie diverse, quindi lo stesso numero può esistere due
   * volte e senza questo filtro si aprirebbe l'ordine sbagliato. */
  function cercaOrdine(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggio(null);

    const cercato = Number(numero);
    const trovato = bozze.find((o) => o.numero === cercato);
    if (!trovato) {
      const gia = dalTavolo.find((o) => o.numero === cercato && o.stato !== 'bozza');
      setErrore(
        gia
          ? `L'ordine n. ${cercato} è già stato confermato in cassa: lo trovi qui a fianco come ${gia.codice}.`
          : `Nessun ordine dal tavolo con numero ${cercato} in questa serata. Controlla il numero sullo schermo del cliente.`
      );
      return;
    }
    setApertoId(trovato.id);
    setNumero('');
  }

  function chiudi(testo: string | null) {
    setMessaggio(testo);
    setApertoId(null);
  }

  return (
    <div className="bozze">
      <section className="riquadro colonna-elenco">
        <h2>
          Bozze <span className="contatore">{elenco.length}</span>
        </h2>
        <p className="spiegazione">
          Ordini arrivati dal QR dei tavoli: quelli ancora da confermare e quelli già confermati che
          aspettano il pagamento. A fine serata questo elenco deve essere vuoto.
        </p>
        {elenco.length === 0 ? (
          <p className="vuoto">Non c’è niente in sospeso.</p>
        ) : (
          <ul className="elenco-bozze">
            {elenco.map((o) => (
              <RigaBozza
                key={o.id}
                ordine={o}
                aperto={o.id === apertoId}
                onApri={
                  o.stato === 'da_pagare'
                    ? () => {
                        setErrore(null);
                        setMessaggio(null);
                        setApertoId(o.id);
                      }
                    : null
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="riquadro colonna-lavoro">
        <form className="cerca-ordine in-linea" onSubmit={cercaOrdine}>
          <label>
            Numero ordine dal tavolo
            <input
              type="number"
              min="1"
              placeholder="000"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button type="submit" className="bottone-principale" disabled={!numero.trim()}>
            Richiama l'ordine
          </button>
        </form>

        {errore && <p className="errore">{errore}</p>}
        {messaggio && <p className="successo">{messaggio}</p>}

        {aperto ? (
          <div className="lavoro-ordine">
            <TestataOrdine ordine={aperto} />
            <VociOrdine
              ordine={aperto}
              etichettaTotale={aperto.stato === 'da_pagare' ? 'Da incassare' : 'Da pagare'}
            />
            <PassiOrdine
              ordine={aperto}
              onFatto={(testo) => chiudi(testo)}
              onChiudi={() => chiudi(null)}
              etichettaChiudi="Torna indietro"
            />
          </div>
        ) : (
          <p className="spiegazione nessun-ordine">
            Chiedi al cliente il numero mostrato sul suo telefono e digitalo qui sopra. Per un ordine già
            confermato, aprilo invece dall’elenco.
          </p>
        )}
      </section>
    </div>
  );
}
