import { useState } from 'react';
import {
  NOME_BAGNO,
  SEGNALAZIONI_BAGNO,
  type Bagno,
  type TipoSegnalazione,
} from '@sagra-mazzocco/shared';
import { messaggioErrore, segnalaBagno } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

/** Quanto aspetta questo telefono prima di poter mandare un'altra
 * segnalazione. È solo buona educazione verso gli schermi del personale: il
 * freno vero lo mette il server, che non crea due volte la stessa cosa. */
const MINUTI_DI_ATTESA = 5;
const CHIAVE_ULTIMO_INVIO = 'sagra-ultima-segnalazione';

/** La pagina che si apre inquadrando il QR appeso in bagno.
 *
 * Non c'è accesso, non c'è niente da scrivere, non si torna indietro: si tocca
 * cosa non va e si esce. Chi la sta usando è in piedi in un bagno, magari con
 * una mano sola, e non ha nessuna voglia di usare un'app. */
export function SegnalaBagno({ bagno }: { bagno: Bagno | null }) {
  const [inCorso, setInCorso] = useState<TipoSegnalazione | null>(null);
  const [inviata, setInviata] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  function troppoPresto(): boolean {
    try {
      const ultimo = Number(localStorage.getItem(CHIAVE_ULTIMO_INVIO) ?? 0);
      return Date.now() - ultimo < MINUTI_DI_ATTESA * 60 * 1000;
    } catch {
      // Navigazione in incognito o memoria del browser bloccata: pazienza, il
      // server sa comunque riconoscere i doppioni.
      return false;
    }
  }

  async function manda(tipo: TipoSegnalazione) {
    if (!bagno || inCorso) return;
    if (troppoPresto()) {
      // Si ringrazia lo stesso: chi ha appena segnalato non deve sentirsi dire
      // di no, e la cosa è comunque già arrivata.
      setInviata(true);
      return;
    }
    setErrore(null);
    setInCorso(tipo);
    try {
      await segnalaBagno({ serataId: SERATA_ID_OGGI, bagno, tipo });
      try {
        localStorage.setItem(CHIAVE_ULTIMO_INVIO, String(Date.now()));
      } catch {
        /* vedi sopra */
      }
      setInviata(true);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  if (!bagno) {
    return (
      <div className="segnala-bagno">
        <div className="testata-segnalazione">
          <span className="occhiello">Sagra di Mazzocco</span>
          <h1>Cartello non valido</h1>
        </div>
        <p className="spiegazione">
          Questo cartello non dice a quale bagno si riferisce. Avvisa una persona della sagra, grazie.
        </p>
      </div>
    );
  }

  if (inviata) {
    return (
      <div className="segnala-bagno">
        <div className="esito-segnalazione">
          <span className="spunta-grande" aria-hidden="true">
            ✓
          </span>
          <h1>Grazie, avvisati!</h1>
          <p>Arriviamo il prima possibile.</p>
          <p className="spiegazione">Puoi chiudere questa pagina.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="segnala-bagno">
      <div className="testata-segnalazione">
        <span className="occhiello">Sagra di Mazzocco</span>
        <h1>Cosa non va?</h1>
        <p className="quale-bagno">Bagno {NOME_BAGNO[bagno]}</p>
      </div>

      {errore && <p className="errore">{errore}</p>}

      <ul className="elenco-segnalazioni">
        {SEGNALAZIONI_BAGNO.map((voce) => (
          <li key={voce.id}>
            <button type="button" disabled={inCorso !== null} onClick={() => manda(voce.id)}>
              <span>{voce.testo}</span>
              <span className="freccia" aria-hidden="true">
                {inCorso === voce.id ? '…' : '›'}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="spiegazione">Tocca la riga: basta quello, non serve scrivere niente.</p>
    </div>
  );
}
