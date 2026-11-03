import { useEffect, useRef, useState } from 'react';
import { indirizzoApp } from '@sagra-mazzocco/shared';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { QUANTI, estrai, interoACaso, leggiEstratti, salvaEstratti } from './tombola';
import { smorfia } from './smorfia';

/** Quanto dura il giro dei numeri prima che si fermi su quello estratto. */
const DURATA_GIRO = 2400;

/** Il tabellone è in sei blocchi da quindici numeri, come le sei cartelle di
 * una tombola: due blocchi affiancati, tre righe da cinque ciascuno. */
const BLOCCHI = Array.from({ length: 6 }, (_, b) =>
  Array.from({ length: 15 }, (_, i) => {
    const riga = Math.floor(b / 2) * 3 + Math.floor(i / 5);
    return riga * 10 + (b % 2) * 5 + (i % 5) + 1;
  }),
);

const CHIAVE_VOCE = 'tombola-voce';

function leggiVoce(): boolean {
  try {
    return localStorage.getItem(CHIAVE_VOCE) === '1';
  } catch {
    return false;
  }
}

/** Legge ad alta voce il numero e il suo nome, per chi è lontano dallo schermo. */
function annuncia(numero: number) {
  if (!('speechSynthesis' in window)) return;
  const { italiano } = smorfia(numero);
  const frase = new SpeechSynthesisUtterance(`${numero}. ${italiano}`);
  frase.lang = 'it-IT';
  frase.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(frase);
}

type Fase = 'fermo' | 'giro' | 'uscito';

function movimentoRidotto(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function App() {
  const [estratti, setEstratti] = useState<number[]>(leggiEstratti);
  const [fase, setFase] = useState<Fase>('fermo');
  const [mostrato, setMostrato] = useState<number | null>(null);
  const [conferma, setConferma] = useState(false);
  const [voce, setVoce] = useState(leggiVoce);
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
      if (voce) annuncia(numero);
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
    window.speechSynthesis?.cancel();
    setEstratti([]);
    salvaEstratti([]);
    setMostrato(null);
    setFase('fermo');
    setConferma(false);
  }

  const recenti = estratti.slice(-8, -1).reverse();
  const nomeUscito = fase === 'uscito' && ultimo !== null ? smorfia(ultimo) : null;

  function cambiaVoce() {
    const nuova = !voce;
    setVoce(nuova);
    try {
      localStorage.setItem(CHIAVE_VOCE, nuova ? '1' : '0');
    } catch {
      // la scelta vale solo per questa apertura
    }
    if (!nuova) window.speechSynthesis?.cancel();
  }

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
          <div className="nome-smorfia" aria-hidden="true">
            {nomeUscito ? (
              <>
                <b>{nomeUscito.nome}</b>
                <i>{nomeUscito.italiano}</i>
              </>
            ) : null}
          </div>
          <p className="annuncio" role="status" aria-live="polite">
            {inGiro
              ? 'Estrazione in corso…'
              : ultimo !== null && fase === 'uscito'
                ? `È uscito il ${ultimo}: ${smorfia(ultimo).italiano}`
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
          <label className="voce">
            <input type="checkbox" checked={voce} onChange={cambiaVoce} />
            Leggi il numero ad alta voce
          </label>
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
          <div className="blocchi-tabellone">
            {BLOCCHI.map((numeri, b) => (
              <div key={b} className="blocco-tabellone">
                {numeri.map((n) => {
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
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
