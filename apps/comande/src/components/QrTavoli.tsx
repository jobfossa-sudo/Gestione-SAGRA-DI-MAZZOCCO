import { useEffect, useState } from 'react';
import { creaQrSvg } from '../services/qr';
import { indirizzoTavolo } from '../services/tavolo';
import { stampa } from './AreaStampa';

/** Il QR di un tavolo. Il disegno arriva da `qrcode`, non da fuori: per questo
 * si può inserire come HTML. */
export function QrTavolo({ svg }: { svg: string }) {
  return <div className="qr-tavolo" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** Quanti tavoli ha la sagra: si scrive una volta e si stampa il foglietto da
 * mettere su ogni tavolo. Il QR porta al menù già col numero giusto. */
export function QrTavoli() {
  const [quanti, setQuanti] = useState('20');
  const numero = Number(quanti);
  const tavoli = Number.isInteger(numero) && numero > 0 && numero <= 200 ? numero : 0;
  const elenco = Array.from({ length: tavoli }, (_, i) => i + 1);
  const [disegni, setDisegni] = useState<Map<number, string>>(new Map());
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let annullato = false;
    Promise.all(elenco.map(async (tavolo) => [tavolo, await creaQrSvg(tavolo)] as const)).then((coppie) => {
      if (!annullato) setDisegni(new Map(coppie));
    });
    return () => {
      annullato = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tavoli]);

  /** I QR si preparano prima di chiamare la stampa: se si stampasse subito,
   * i fogli usciranno senza il quadrato. */
  async function stampaTutti(numeri: number[]) {
    setInCorso(true);
    try {
      const fogli = await Promise.all(
        numeri.map(async (tavolo) => ({ tipo: 'qrTavolo' as const, tavolo, svg: await creaQrSvg(tavolo) }))
      );
      stampa(fogli);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="area riquadro qr-tavoli">
      <h2>QR dei tavoli</h2>
      <p className="spiegazione">
        Un foglio per tavolo: il cliente lo inquadra e vede il menù con il suo numero di tavolo già scritto.
        L'indirizzo è quello da cui stai usando l'app, quindi stampa i QR dal sito pubblicato, non dalla prova sul
        computer.
      </p>
      <p className="indirizzo-qr">{indirizzoTavolo(1)}</p>

      <div className="campi-tavolo">
        <label>
          Quanti tavoli
          <input type="number" min="1" max="200" value={quanti} onChange={(e) => setQuanti(e.target.value)} />
        </label>
        <button
          type="button"
          className="bottone-principale"
          disabled={tavoli === 0 || inCorso}
          onClick={() => stampaTutti(elenco)}
        >
          {inCorso ? 'Preparo i fogli…' : `Stampa tutti i ${tavoli} fogli`}
        </button>
      </div>

      <ul className="griglia-qr">
        {elenco.map((tavolo) => {
          const svg = disegni.get(tavolo);
          return (
            <li key={tavolo}>
              {svg ? <QrTavolo svg={svg} /> : <div className="qr-tavolo" />}
              <span className="numero-tavolo">Tavolo {tavolo}</span>
              <button type="button" disabled={inCorso} onClick={() => stampaTutti([tavolo])}>
                Stampa
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
