import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MISURE_CARTA, type Bagno, type Ordine, type TipoBiglietto } from '@sagra-mazzocco/shared';
import { useBiglietti, useImmagini } from '../hooks';
import { FoglioComposto } from './FoglioComposto';
import { FoglioQrBagno, FoglioQrMenu } from './Fogli';

export type Foglio =
  | { tipo: TipoBiglietto; ordine: Ordine }
  /** Il QR arriva già disegnato: va preparato prima di chiamare la stampa. */
  | { tipo: 'qrMenu'; svg: string }
  /** Il cartello da appendere in bagno, uno per bagno. */
  | { tipo: 'qrBagno'; svg: string; bagno: Bagno };

let ricevi: ((fogli: Foglio[]) => void) | null = null;

/** Manda dei fogli alla stampante. Una pagina web non può scegliere la
 * stampante né saltare la finestra di stampa: lo fa il browser, e Chrome
 * avviato con --kiosk-printing stampa diretto sulla stampante predefinita. */
export function stampa(fogli: Foglio[]): void {
  if (fogli.length > 0) ricevi?.(fogli);
}

/** Va montata una volta sola nell'app. Sullo schermo è invisibile; in stampa
 * è l'unica cosa che esce, un foglio per pagina. */
export function AreaStampa() {
  const [fogli, setFogli] = useState<Foglio[]>([]);
  const biglietti = useBiglietti();
  const immagini = useImmagini();

  useEffect(() => {
    // Richieste arrivate insieme escono in un'unica stampa.
    ricevi = (nuovi) => setFogli((prec) => [...prec, ...nuovi]);
    return () => {
      ricevi = null;
    };
  }, []);

  useEffect(() => {
    if (fogli.length === 0) return;
    // I codici a barre e i QR si disegnano negli effetti dei fogli, che girano
    // prima di questo: quando si arriva qui la pagina è completa.
    window.print();
    setFogli([]);
  }, [fogli]);

  // Il formato della carta lo decide il primo foglio della stampa: una stessa
  // stampa non può mescolare misure diverse. Il cartello col QR resta A5
  // verticale, la sua misura non si cambia.
  const primo = fogli[0];
  const formato =
    primo === undefined
      ? null
      : primo.tipo === 'qrMenu' || primo.tipo === 'qrBagno'
        ? 'A5 portrait'
        : MISURE_CARTA[biglietti[primo.tipo].formato].regolaCss;

  return createPortal(
    <div className="area-stampa">
      {/* I margini del foglio li mette il biglietto stesso, quindi qui la
          pagina non ne aggiunge altri. */}
      {formato && <style>{`@page { size: ${formato}; margin: 0; }`}</style>}
      {fogli.map((foglio, indice) =>
        foglio.tipo === 'qrMenu' ? (
          <FoglioQrMenu key={indice} svg={foglio.svg} />
        ) : foglio.tipo === 'qrBagno' ? (
          <FoglioQrBagno key={indice} svg={foglio.svg} bagno={foglio.bagno} />
        ) : (
          <FoglioComposto
            key={indice}
            biglietto={biglietti[foglio.tipo]}
            ordine={foglio.ordine}
            immagini={immagini}
          />
        )
      )}
    </div>,
    document.body
  );
}
