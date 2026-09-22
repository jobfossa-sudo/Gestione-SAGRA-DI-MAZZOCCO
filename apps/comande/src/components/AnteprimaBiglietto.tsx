import { useEffect, useRef, useState } from 'react';
import { NOME_BIGLIETTO, type Ordine, type TipoBiglietto } from '@sagra-mazzocco/shared';
import { useBiglietti, useImmagini } from '../hooks';
import { FoglioComposto } from './FoglioComposto';

/** Il biglietto come uscirà dalla stampante, rimpicciolito per stare nello
 * spazio che c'è. Non è un disegno a parte: è lo stesso foglio che stampa
 * davvero, impaginato come l'ha composto l'amministratore nella scheda
 * "Biglietti". Il giorno che il formato diventerà uno scontrino stretto da
 * stampante termica, l'anteprima diventerà uno scontrino stretto da sola. */
export function AnteprimaBiglietto({
  tipo,
  ordine,
  nota,
}: {
  tipo: TipoBiglietto;
  ordine: Ordine;
  /** Una riga sotto il titolo, quando c'è qualcosa da avvertire. */
  nota?: string;
}) {
  const biglietti = useBiglietti();
  const immagini = useImmagini();
  const cornice = useRef<HTMLDivElement>(null);
  const foglio = useRef<HTMLDivElement>(null);
  const [scala, setScala] = useState(1);
  const [altezza, setAltezza] = useState<number | undefined>(undefined);

  // Il foglio ha una misura in millimetri, la colonna ha quella che le lascia
  // lo schermo: si calcola di quanto va rimpicciolito perché ci stia. Si
  // rimisura a ogni cambio di larghezza (finestra, colonne che si
  // incolonnano) e a ogni cambio di contenuto (un piatto in più allunga il
  // foglio). La lente non ingrandisce mai oltre il vero: un biglietto più
  // grande del reale ingannerebbe su come verrà stampato.
  useEffect(() => {
    const scatola = cornice.current;
    const dentro = foglio.current;
    if (!scatola || !dentro) return;

    const misura = () => {
      // offsetWidth/Height non risentono della lente: sono le misure vere del
      // foglio, quindi il conto non si rincorre da solo.
      const larghezza = dentro.offsetWidth;
      const altezzaFoglio = dentro.offsetHeight;
      if (larghezza === 0 || altezzaFoglio === 0) return;
      // Comanda la larghezza. Rimpicciolirlo anche per farlo stare in altezza
      // era la prima idea, ma un A5 orizzontale nello spazio che avanza sotto
      // il riepilogo scende sotto il 35%: tutto visibile e tutto illeggibile.
      // Meglio grande e leggibile, e chi ha lo schermo basso scorre un po'.
      const fattore = Math.min(1, scatola.clientWidth / larghezza);
      setScala(fattore);
      setAltezza(altezzaFoglio * fattore);
    };

    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(scatola);
    osservatore.observe(dentro);
    return () => osservatore.disconnect();
  }, []);

  return (
    <section className="riquadro anteprima-biglietto">
      <h2>{NOME_BIGLIETTO[tipo]}</h2>
      <p className="spiegazione">{nota ?? 'Così uscirà dalla stampante.'}</p>
      <div className="cornice-stampa" ref={cornice} style={{ height: altezza }}>
        <div ref={foglio} className="foglio-in-scala" style={{ transform: `scale(${scala})` }}>
          <FoglioComposto biglietto={biglietti[tipo]} ordine={ordine} immagini={immagini} />
        </div>
      </div>
    </section>
  );
}
