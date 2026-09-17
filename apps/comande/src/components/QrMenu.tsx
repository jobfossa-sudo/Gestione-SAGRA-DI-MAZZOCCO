import { useEffect, useState } from 'react';
import { creaQrSvg } from '../services/qr';
import { indirizzoMenu } from '../services/tavolo';
import { stampa } from './AreaStampa';

/** Il QR del menù. Il disegno arriva da `qrcode`, non da fuori: per questo si
 * può inserire come HTML. */
export function QrCodice({ svg }: { svg: string }) {
  return <div className="qr-codice" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Il QR è uno solo, uguale per tutti i tavoli: il cliente scrive da sé il
 * numero del tavolo dentro il menù. Qui si stampa il cartello da mettere sui
 * tavoli, in quante copie servono. */
export function QrMenu() {
  const [copie, setCopie] = useState('20');
  const numero = Number(copie);
  const quante = Number.isInteger(numero) && numero > 0 && numero <= 200 ? numero : 0;
  const [svg, setSvg] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let annullato = false;
    creaQrSvg(indirizzoMenu()).then((disegno) => {
      if (!annullato) setSvg(disegno);
    });
    return () => {
      annullato = true;
    };
  }, []);

  /** Il QR si prepara prima di chiamare la stampa: se si stampasse subito, i
   * fogli usciranno senza il quadrato. */
  async function stampaCartelli(quantita: number) {
    setInCorso(true);
    try {
      const disegno = await creaQrSvg(indirizzoMenu());
      stampa(Array.from({ length: quantita }, () => ({ tipo: 'qrMenu' as const, svg: disegno })));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="area riquadro qr-menu">
      <h2>QR del menù</h2>
      <p className="spiegazione">
        Un cartello uguale per tutti i tavoli: il cliente inquadra il QR, apre il menù e scrive lui il numero del
        tavolo dove si è seduto. L'indirizzo del QR è quello da cui stai usando l'app, quindi stampa i cartelli dal
        sito pubblicato e non dalla prova sul computer.
      </p>
      <p className="indirizzo-qr">{indirizzoMenu()}</p>

      <div className="anteprima-cartello">
        {svg ? <QrCodice svg={svg} /> : <div className="qr-codice" />}
      </div>

      <div className="campi-tavolo">
        <label>
          Quante copie
          <input type="number" min="1" max="200" value={copie} onChange={(e) => setCopie(e.target.value)} />
        </label>
        <button
          type="button"
          className="bottone-principale"
          disabled={quante === 0 || inCorso}
          onClick={() => stampaCartelli(quante)}
        >
          {inCorso ? 'Preparo i fogli…' : `Stampa ${quante} ${quante === 1 ? 'copia' : 'copie'}`}
        </button>
        <button type="button" disabled={inCorso} onClick={() => stampaCartelli(1)}>
          Stampa una copia di prova
        </button>
      </div>

      <p className="spiegazione">
        Il cartello è a colori, ma resta leggibile anche stampato in bianco e nero: il QR è sempre nero su bianco.
      </p>
    </div>
  );
}
