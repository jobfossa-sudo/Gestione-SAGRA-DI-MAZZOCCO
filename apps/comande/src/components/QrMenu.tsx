import { useEffect, useState } from 'react';
import { BAGNI, NOME_BAGNO, type Bagno } from '@sagra-mazzocco/shared';
import { creaQrSvg } from '../services/qr';
import { indirizzoMenu } from '../services/tavolo';
import { indirizzoBagno } from '../services/bagni';
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
    <div className="area qr-schede">
      <section className="riquadro qr-menu">
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
      </section>

      <QrBagni />
    </div>
  );
}

/** I cartelli da appendere nei bagni: uno per bagno, ciascuno col suo QR.
 *
 * Sono tre e vicini, ma ognuno ha il suo: così l'avviso che arriva sugli
 * schermi dice già in quale entrare, e chi ci va porta la cosa giusta senza
 * aprire tre porte. */
function QrBagni() {
  const [svg, setSvg] = useState<Partial<Record<Bagno, string>>>({});
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    let annullato = false;
    Promise.all(BAGNI.map((bagno) => creaQrSvg(indirizzoBagno(bagno)).then((disegno) => [bagno, disegno] as const)))
      .then((coppie) => {
        if (!annullato) setSvg(Object.fromEntries(coppie));
      });
    return () => {
      annullato = true;
    };
  }, []);

  /** I QR si preparano prima di chiamare la stampa: se si stampasse subito, i
   * fogli uscirebbero senza il quadrato. */
  async function stampaCartelli(quali: Bagno[]) {
    setInCorso(true);
    try {
      const fogli = await Promise.all(
        quali.map(async (bagno) => ({
          tipo: 'qrBagno' as const,
          bagno,
          svg: await creaQrSvg(indirizzoBagno(bagno)),
        }))
      );
      stampa(fogli);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <section className="riquadro qr-menu qr-bagni">
      <h2>QR dei bagni</h2>
      <p className="spiegazione">
        Un cartello per ogni bagno. Chi trova qualcosa che non va lo inquadra, tocca cosa manca e basta: l'avviso
        compare subito sugli schermi di tutti, con scritto quale bagno. Non serve nessun accesso e non c'è niente
        da scrivere. Anche questi vanno stampati dal sito pubblicato, non dalla prova sul computer.
      </p>

      <div className="fila-bagni">
        {BAGNI.map((bagno) => (
          <div key={bagno} className="cartello-bagno">
            <h3>Bagno {NOME_BAGNO[bagno]}</h3>
            <div className="anteprima-cartello">
              {svg[bagno] ? <QrCodice svg={svg[bagno]!} /> : <div className="qr-codice" />}
            </div>
            <p className="indirizzo-qr">{indirizzoBagno(bagno)}</p>
            <button type="button" disabled={inCorso} onClick={() => stampaCartelli([bagno])}>
              Stampa questo
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="bottone-principale"
        disabled={inCorso}
        onClick={() => stampaCartelli([...BAGNI])}
      >
        {inCorso ? 'Preparo i fogli…' : 'Stampa tutti e tre i cartelli'}
      </button>
    </section>
  );
}
