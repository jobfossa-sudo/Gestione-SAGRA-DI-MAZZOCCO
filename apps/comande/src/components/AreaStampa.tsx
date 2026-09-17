import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Ordine } from '@sagra-mazzocco/shared';
import { FoglioCopiaCucina, FoglioQrMenu, FoglioResoconto } from './Fogli';

export type Foglio =
  | { tipo: 'resoconto'; ordine: Ordine }
  | { tipo: 'copiaCucina'; ordine: Ordine }
  /** Il QR arriva già disegnato: va preparato prima di chiamare la stampa. */
  | { tipo: 'qrMenu'; svg: string };

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
      {fogli.map((foglio, indice) => {
        if (foglio.tipo === 'resoconto') return <FoglioResoconto key={indice} ordine={foglio.ordine} />;
        if (foglio.tipo === 'copiaCucina') return <FoglioCopiaCucina key={indice} ordine={foglio.ordine} />;
        return <FoglioQrMenu key={indice} svg={foglio.svg} />;
      })}
    </div>,
    document.body
  );
}
