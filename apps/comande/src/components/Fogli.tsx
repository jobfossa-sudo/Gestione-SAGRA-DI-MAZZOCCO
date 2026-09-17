import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';
import { leggiCodiceBarre, type Ordine } from '@sagra-mazzocco/shared';
import { QrCodice } from './QrMenu';

/** Il codice a barre (Code 128: lettere e cifre) disegnato come immagine
 * vettoriale, così esce nitido su qualsiasi stampante. */
export function CodiceABarre({ valore }: { valore: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, valore, { format: 'CODE128', displayValue: false, height: 70, width: 2, margin: 0 });
  }, [valore]);

  return <svg ref={ref} className="codice-a-barre" role="img" aria-label={`Codice a barre ${valore}`} />;
}

/** "A0001 · 16/09/2026 · 21:30 · Cassa A": la versione leggibile di quello che
 * c'è dentro il codice a barre, da stampare sotto le strisce. */
export function rigaLeggibile(ordine: Ordine): string {
  const parti = ordine.codiceBarre ? leggiCodiceBarre(ordine.codiceBarre) : null;
  if (!parti) return ordine.codice ?? `n. ${ordine.numero}`;
  const data = `${parti.data.slice(6, 8)}/${parti.data.slice(4, 6)}/${parti.data.slice(0, 4)}`;
  const ora = `${parti.ora.slice(0, 2)}:${parti.ora.slice(2, 4)}`;
  return `${parti.codice} · ${data} · ${ora} · Cassa ${parti.cassa}`;
}

/** Il cartello da mettere sul tavolo: uno solo, uguale per tutti i tavoli. È a
 * colori, ma il QR resta nero su bianco, così funziona anche stampato in
 * bianco e nero. */
export function FoglioQrMenu({ svg }: { svg: string }) {
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
