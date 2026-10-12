import { useEffect, useState } from 'react';
import { BAGNI, indirizzoQrBagno, indirizzoQrMenu, NOME_BAGNO, type Bagno } from '@sagra-mazzocco/shared';
import { creaQrSvg, QrCodice, stampaCartelli, type Cartello } from './Cartelli';

const SVILUPPO = import.meta.env.DEV;

type Voce = { id: 'menu'; titolo: string; spiegazione: string; indirizzo: string } | {
  id: Bagno;
  titolo: string;
  spiegazione: string;
  indirizzo: string;
};

function voci(): Voce[] {
  const origine = window.location.origin;
  return [
    {
      id: 'menu',
      titolo: 'Menù dei tavoli',
      spiegazione: 'Uno solo per tutti i tavoli: il cliente scrive da sé il numero del tavolo.',
      indirizzo: indirizzoQrMenu(origine, SVILUPPO),
    },
    ...BAGNI.map((bagno) => ({
      id: bagno,
      titolo: `Bagno ${NOME_BAGNO[bagno]}`,
      spiegazione: 'Chi trova qualcosa che non va lo inquadra e tocca cosa manca.',
      indirizzo: indirizzoQrBagno(origine, SVILUPPO, bagno),
    })),
  ];
}

function cartelloDi(voce: Voce, svg: string): Cartello {
  return voce.id === 'menu' ? { tipo: 'menu', svg } : { tipo: 'bagno', bagno: voce.id, svg };
}

/** Tutti i QR dei clienti in una pagina: il menù dei tavoli e i tre bagni.
 *
 * Ognuno si può mostrare grande sullo schermo, per farlo inquadrare al volo
 * dal telefono di chi lavora, oppure stampare come cartello A5. Mostrare
 * serve a chiunque lavori; stampare resta dell'amministratore, perché i
 * cartelli vanno stampati una volta, dal sito pubblicato. */
export function CodiciQr({ amministratore }: { amministratore: boolean }) {
  const elenco = voci();
  const [disegni, setDisegni] = useState<Record<string, string>>({});
  const [aSchermo, setASchermo] = useState<Voce | null>(null);
  const [copie, setCopie] = useState('20');
  const [inCorso, setInCorso] = useState(false);
  const numero = Number(copie);
  const quante = Number.isInteger(numero) && numero > 0 && numero <= 200 ? numero : 0;

  useEffect(() => {
    let annullato = false;
    Promise.all(elenco.map(async (voce) => [voce.id, await creaQrSvg(voce.indirizzo)] as const)).then((coppie) => {
      if (!annullato) setDisegni(Object.fromEntries(coppie));
    });
    return () => {
      annullato = true;
    };
    // L'elenco dipende solo dall'indirizzo della pagina, che non cambia.
  }, []);

  // Il QR a schermo si chiude anche col tasto Esc.
  useEffect(() => {
    if (!aSchermo) return;
    const chiudi = (e: KeyboardEvent) => e.key === 'Escape' && setASchermo(null);
    window.addEventListener('keydown', chiudi);
    return () => window.removeEventListener('keydown', chiudi);
  }, [aSchermo]);

  /** I QR si preparano prima di chiamare la stampa: se si stampasse subito, i
   * fogli uscirebbero senza il quadrato. */
  async function stampa(scelte: Voce[], ripetizioni = 1) {
    setInCorso(true);
    try {
      const cartelli = await Promise.all(scelte.map(async (voce) => cartelloDi(voce, await creaQrSvg(voce.indirizzo))));
      stampaCartelli(cartelli.flatMap((c) => Array.from({ length: ripetizioni }, () => c)));
    } finally {
      setInCorso(false);
    }
  }

  const bagni = elenco.filter((v) => v.id !== 'menu');

  return (
    <main className="pagina-qr">
      <div className="intestazione-qr">
        <a className="torna-menu" href="#">
          ◀ Menù
        </a>
        <h2>Codici QR</h2>
      </div>
      <p className="spiegazione">
        <strong>📱 Mostra</strong> apre il QR grande sullo schermo, da far inquadrare al cliente.
        {amministratore
          ? ' 🖨 Stampa prepara il cartello A5 colorato: stampalo dal sito pubblicato, non dalla prova sul computer, perché il QR porta all\'indirizzo da cui lo stai usando.'
          : ' I cartelli da appendere li stampa l\'amministratore.'}
      </p>

      <div className="griglia-qr">
        {elenco.map((voce) => (
          <section key={voce.id} className="riquadro-qr">
            <h3>{voce.titolo}</h3>
            <div className="anteprima-cartello">
              {disegni[voce.id] ? <QrCodice svg={disegni[voce.id]} /> : <div className="qr-codice" />}
            </div>
            <p className="spiegazione">{voce.spiegazione}</p>
            <p className="indirizzo-qr">{voce.indirizzo}</p>
            <div className="tasti-qr">
              <button type="button" className="bottone-principale" onClick={() => setASchermo(voce)}>
                📱 Mostra
              </button>
              {amministratore &&
                (voce.id === 'menu' ? (
                  <div className="stampa-copie">
                    <label>
                      Copie
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={copie}
                        onChange={(e) => setCopie(e.target.value)}
                        aria-label="Quante copie del cartello del menù"
                      />
                    </label>
                    <button type="button" disabled={quante === 0 || inCorso} onClick={() => stampa([voce], quante)}>
                      🖨 Stampa {quante || ''}
                    </button>
                  </div>
                ) : (
                  <button type="button" disabled={inCorso} onClick={() => stampa([voce])}>
                    🖨 Stampa
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>

      {amministratore && (
        <div className="tasti-qr">
          <button type="button" disabled={inCorso} onClick={() => stampa(bagni)}>
            🖨 Stampa i cartelli di tutti e tre i bagni
          </button>
        </div>
      )}

      {aSchermo && (
        <div className="qr-a-schermo" role="dialog" aria-modal="true" aria-label={aSchermo.titolo} onClick={() => setASchermo(null)}>
          <h2>{aSchermo.titolo}</h2>
          {disegni[aSchermo.id] && <QrCodice svg={disegni[aSchermo.id]} />}
          <p>Inquadra il quadrato con la fotocamera</p>
          <button type="button" className="bottone-principale">
            Chiudi
          </button>
        </div>
      )}
    </main>
  );
}
