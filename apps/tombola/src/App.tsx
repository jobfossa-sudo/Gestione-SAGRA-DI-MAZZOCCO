import { useEffect, useRef, useState } from 'react';
import { indirizzoApp } from '@sagra-mazzocco/shared';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { COLONNE, QUANTI, estrai, interoACaso, leggiEstratti, salvaEstratti } from './tombola';

/** Quanto dura il giro dei numeri prima che si fermi su quello estratto. */
const DURATA_GIRO = 2400;

const NUMERI = Array.from({ length: QUANTI }, (_, i) => i + 1);

type Fase = 'fermo' | 'giro' | 'uscito';

function movimentoRidotto(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function App() {
  const [estratti, setEstratti] = useState<number[]>(leggiEstratti);
  const [fase, setFase] = useState<Fase>('fermo');
  const [mostrato, setMostrato] = useState<number | null>(null);
  const [conferma, setConferma] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const ultimo = estratti.length > 0 ? estratti[estratti.length - 1] : null;
  const finito = estratti.length === QUANTI;
  const inGiro = fase === 'giro';

  function estraiNumero() {
    if (inGiro) return;
    const numero = estrai(estratti);
    if (numero === null) return;
    setConferma(false);

    const ferma = () => {
      window.clearInterval(timer.current);
      const nuovi = [...estratti, numero];
      setEstratti(nuovi);
      salvaEstratti(nuovi);
      setMostrato(numero);
      setFase('uscito');
    };

    if (movimentoRidotto()) {
      ferma();
      return;
    }
    // Il giro: numeri a caso che si alternano, sempre più lenti, poi quello vero.
    setFase('giro');
    const inizio = performance.now();
    let prossimo = 0;
    timer.current = window.setInterval(() => {
      const passato = performance.now() - inizio;
      if (passato >= DURATA_GIRO) return ferma();
      if (passato < prossimo) return;
      setMostrato(1 + interoACaso(QUANTI));
      prossimo = passato + 60 + (passato / DURATA_GIRO) ** 2 * 260;
    }, 30);
  }

  function ricomincia() {
    window.clearInterval(timer.current);
    setEstratti([]);
    salvaEstratti([]);
    setMostrato(null);
    setFase('fermo');
    setConferma(false);
  }

  const recenti = estratti.slice(-8, -1).reverse();

  return (
    <div className="app-tombola">
      <header className="barra-titolo">
        <div className="marchio">
          <h1>Sagra di Mazzocco · Tombola</h1>
          <p>
            {estratti.length === 0
              ? 'Nessun numero estratto'
              : `${estratti.length} numeri estratti su ${QUANTI}`}
          </p>
        </div>
        <div className="utente">
          <a className="torna-menu" href={indirizzoApp('portale', import.meta.env.DEV)}>
            ◀ Menù
          </a>
          <SelettoreCarattere />
          <SelettoreTema />
        </div>
      </header>

      <main>
        <section className="estrazione" aria-label="Estrazione">
          <div className={`pallina ${fase}`} aria-hidden="true">
            <span key={fase === 'uscito' ? `u${mostrato}` : 'x'} className="cifra">
              {mostrato ?? '—'}
            </span>
          </div>
          <p className="annuncio" role="status" aria-live="polite">
            {inGiro
              ? 'Estrazione in corso…'
              : ultimo !== null && fase === 'uscito'
                ? `È uscito il ${ultimo}`
                : finito
                  ? 'Sono usciti tutti i numeri'
                  : 'Premi il tasto per estrarre'}
          </p>
          <button type="button" className="bottone-principale" disabled={inGiro || finito} onClick={estraiNumero}>
            {inGiro ? 'Estraggo…' : 'Estrai numero'}
          </button>
          {recenti.length > 0 && (
            <div className="recenti">
              <span>Prima:</span>
              {recenti.map((n) => (
                <b key={n}>{n}</b>
              ))}
            </div>
          )}
          {conferma ? (
            <div className="conferma-azzera">
              <span>Cancello tutti i numeri estratti?</span>
              <button type="button" className="azzera" onClick={ricomincia}>
                Sì, ricomincia
              </button>
              <button type="button" onClick={() => setConferma(false)}>
                No
              </button>
            </div>
          ) : (
            <button type="button" disabled={inGiro || estratti.length === 0} onClick={() => setConferma(true)}>
              Nuova partita
            </button>
          )}
        </section>

        <section className="tabellone" aria-label="Tabellone">
          <div className="griglia-tabellone" style={{ gridTemplateColumns: `repeat(${COLONNE}, 1fr)` }}>
            {NUMERI.map((n) => {
              const uscito = estratti.includes(n);
              const nuovo = fase === 'uscito' && n === ultimo;
              return (
                <div
                  key={n}
                  className={`casella-numero${uscito ? ' uscito' : ''}${nuovo ? ' nuovo' : ''}`}
                  aria-label={`${n}${uscito ? ', estratto' : ''}`}
                >
                  {n}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
