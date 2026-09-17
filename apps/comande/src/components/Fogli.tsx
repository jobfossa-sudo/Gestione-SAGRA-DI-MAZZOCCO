import JsBarcode from 'jsbarcode';
import { useEffect, useRef } from 'react';
import { leggiCodiceBarre, type Ordine } from '@sagra-mazzocco/shared';
import { euro } from '../services/formato';
import { QrTavolo } from './QrTavoli';

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

function PiedeCodice({ ordine }: { ordine: Ordine }) {
  if (!ordine.codiceBarre) return null;
  return (
    <div className="piede-codice">
      <CodiceABarre valore={ordine.codiceBarre} />
      <p>{rigaLeggibile(ordine)}</p>
    </div>
  );
}

/** Il foglio che la cassa dà al cliente: cosa ha ordinato e quanto paga. */
export function FoglioResoconto({ ordine }: { ordine: Ordine }) {
  return (
    <section className="foglio">
      <header className="testata-foglio">
        <span className="occhiello">Sagra di Mazzocco</span>
        <span className="tipo-foglio">Resoconto ordine</span>
      </header>
      <p className="codice-grande">{ordine.codice}</p>
      <p className="tavolo-foglio">
        Tavolo {ordine.tavolo ?? '—'} · {ordine.coperti ?? '—'} coperti
      </p>
      <table className="voci-foglio">
        <tbody>
          {ordine.items.map((item) => (
            <tr key={item.prodottoId}>
              <td className="quantita">{item.quantita}×</td>
              <td>{item.nome}</td>
              <td className="destra">{euro(item.prezzo * item.quantita)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Totale</td>
            <td className="destra">{euro(ordine.totale)}</td>
          </tr>
        </tfoot>
      </table>
      <PiedeCodice ordine={ordine} />
    </section>
  );
}

/** Il foglietto da attaccare al tavolo: il cliente inquadra il QR e il menù si
 * apre già col numero del tavolo. */
export function FoglioQrTavolo({ tavolo, svg }: { tavolo: number; svg: string }) {
  return (
    <section className="foglio foglio-qr">
      <header className="testata-foglio">
        <span className="occhiello">Sagra di Mazzocco</span>
        <span className="tipo-foglio">Ordina dal telefono</span>
      </header>
      <p className="tavolo-qr-foglio">
        <span>Tavolo</span> {tavolo}
      </p>
      <QrTavolo svg={svg} />
      <ol className="istruzioni-qr">
        <li>Inquadra il quadrato con la fotocamera del telefono.</li>
        <li>Scegli quante persone siete e cosa volete.</li>
        <li>Invia: sullo schermo compare un numero.</li>
        <li>Vai in cassa, mostra il numero e paga.</li>
      </ol>
    </section>
  );
}

/** Il foglio che esce in Distribuzione e segue il vassoio: niente prezzi, il
 * tavolo in grande e il codice da leggere prima di portarlo via. */
export function FoglioCopiaCucina({ ordine }: { ordine: Ordine }) {
  return (
    <section className="foglio">
      <header className="testata-foglio">
        <span className="occhiello">Sagra di Mazzocco</span>
        <span className="tipo-foglio">Copia cucina</span>
      </header>
      <div className="copia-cucina-testata">
        <p className="codice-grande">{ordine.codice}</p>
        <p className="tavolo-grande">
          <span>Tavolo</span> {ordine.tavolo ?? '—'}
        </p>
      </div>
      <p className="tavolo-foglio">{ordine.coperti ?? '—'} coperti</p>
      <table className="voci-foglio">
        <tbody>
          {ordine.items.map((item) => (
            <tr key={item.prodottoId}>
              <td className="quantita">{item.quantita}×</td>
              <td>{item.nome}</td>
              <td className="casella-spunta" aria-hidden="true" />
            </tr>
          ))}
        </tbody>
      </table>
      <PiedeCodice ordine={ordine} />
    </section>
  );
}
