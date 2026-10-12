import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { NOME_BAGNO, type Bagno } from '@sagra-mazzocco/shared';

/** Un QR come immagine vettoriale (nitida in stampa). Il disegno richiede un
 * attimo: chi stampa deve aspettarlo, altrimenti il foglio esce senza il
 * quadrato. */
export function creaQrSvg(indirizzo: string): Promise<string> {
  return QRCode.toString(indirizzo, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
}

/** Il disegno arriva da `qrcode`, non da fuori: per questo si può inserire
 * come HTML. */
export function QrCodice({ svg }: { svg: string }) {
  return <div className="qr-codice" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export type Cartello = { tipo: 'menu'; svg: string } | { tipo: 'bagno'; svg: string; bagno: Bagno };

/** Il cartello da mettere sui tavoli: un QR uguale per tutti, il cliente
 * scrive da sé il numero del tavolo nel menù. */
function CartelloMenu({ svg }: { svg: string }) {
  return (
    <section className="foglio foglio-qr">
      <div className="banda-qr">
        <span className="anno-qr">2027</span>
        <h1>Sagra di Mazzocco</h1>
        <p>Ordina dal tavolo con il telefono</p>
      </div>
      <div className="cornice-qr">
        <QrCodice svg={svg} />
      </div>
      <p className="invito-qr">Inquadra il quadrato con la fotocamera</p>
      <ol className="istruzioni-qr">
        <li>
          <span className="passo">1</span> Scrivi il <strong>numero del tavolo</strong> e quante persone siete.
        </li>
        <li>
          <span className="passo">2</span> Scegli dal menù e premi <strong>Invia alla cassa</strong>.
        </li>
        <li>
          <span className="passo">3</span> Sullo schermo compare un <strong>numero</strong>.
        </li>
        <li>
          <span className="passo">4</span> Vai in cassa, mostra il numero e paga.
        </li>
      </ol>
      <p className="piede-qr">Buon appetito!</p>
    </section>
  );
}

/** Il cartello da appendere in bagno: un QR per bagno. Chi lo inquadra tocca
 * cosa manca, e l'avviso arriva sugli schermi di chi lavora. */
function CartelloBagno({ svg, bagno }: { svg: string; bagno: Bagno }) {
  return (
    <section className="foglio foglio-qr foglio-qr-bagno">
      <div className="banda-qr">
        <span className="anno-qr">Bagno {NOME_BAGNO[bagno]}</span>
        <h1>Qualcosa non va?</h1>
        <p>Dillo a noi, ci pensiamo subito</p>
      </div>
      <div className="cornice-qr">
        <QrCodice svg={svg} />
      </div>
      <p className="invito-qr">Inquadra il quadrato con la fotocamera</p>
      <ol className="istruzioni-qr">
        <li>
          <span className="passo">1</span> Tocca <strong>cosa manca</strong> o cosa c'è da sistemare.
        </li>
        <li>
          <span className="passo">2</span> Fatto: arriva subito a chi sta lavorando.
        </li>
      </ol>
      <p className="piede-qr">Grazie!</p>
    </section>
  );
}

let ricevi: ((cartelli: Cartello[]) => void) | null = null;

/** Manda dei cartelli alla stampante, uno per pagina, A5 verticale. */
export function stampaCartelli(cartelli: Cartello[]): void {
  if (cartelli.length > 0) ricevi?.(cartelli);
}

/** Va montata una volta sola. Sullo schermo è invisibile; in stampa è l'unica
 * cosa che esce. */
export function AreaStampa() {
  const [cartelli, setCartelli] = useState<Cartello[]>([]);

  useEffect(() => {
    ricevi = (nuovi) => setCartelli((prec) => [...prec, ...nuovi]);
    return () => {
      ricevi = null;
    };
  }, []);

  useEffect(() => {
    if (cartelli.length === 0) return;
    window.print();
    setCartelli([]);
  }, [cartelli]);

  return createPortal(
    <div className="area-stampa">
      {cartelli.length > 0 && <style>{'@page { size: A5 portrait; margin: 0; }'}</style>}
      {cartelli.map((cartello, indice) =>
        cartello.tipo === 'menu' ? (
          <CartelloMenu key={indice} svg={cartello.svg} />
        ) : (
          <CartelloBagno key={indice} svg={cartello.svg} bagno={cartello.bagno} />
        )
      )}
    </div>,
    document.body
  );
}
