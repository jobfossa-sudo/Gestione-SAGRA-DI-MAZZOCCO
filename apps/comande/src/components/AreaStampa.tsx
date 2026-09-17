import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ordine } from '@sagra-mazzocco/shared';
import { FoglioCopiaCucina, FoglioResoconto } from './Fogli';

export interface Foglio {
  tipo: 'resoconto' | 'copiaCucina';
  ordine: Ordine;
}

let ricevi: ((fogli: Foglio[]) => void) | null = null;

/** Manda dei fogli alla stampante. Una pagina web non può scegliere la
 * stampante né saltare la finestra di stampa: lo fa il browser, e Chrome
 * avviato con --kiosk-printing stampa diretto sulla stampante predefinita. */
export function stampa(fogli: Foglio[]): void {
  if (fogli.length > 0) ricevi?.(fogli);
}

/** Va montata una volta sola nell'app. Sullo schermo è invisibile; in stampa
 * è l'unica cosa che esce, un foglio A5 per pagina. */
export function AreaStampa() {
  const [fogli, setFogli] = useState<Foglio[]>([]);

  useEffect(() => {
    // Richieste arrivate insieme escono in un'unica stampa.
    ricevi = (nuovi) => setFogli((prec) => [...prec, ...nuovi]);
    return () => {
      ricevi = null;
    };
  }, []);

  useEffect(() => {
    if (fogli.length === 0) return;
    // I codici a barre si disegnano negli effetti dei fogli, che girano prima
    // di questo: quando si arriva qui la pagina è completa.
    window.print();
    setFogli([]);
  }, [fogli]);

  return createPortal(
    <div className="area-stampa">
      {fogli.map((foglio, indice) =>
        foglio.tipo === 'resoconto' ? (
          <FoglioResoconto key={indice} ordine={foglio.ordine} />
        ) : (
          <FoglioCopiaCucina key={indice} ordine={foglio.ordine} />
        )
      )}
    </div>,
    document.body
  );
}
