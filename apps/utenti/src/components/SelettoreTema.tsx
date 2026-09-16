import { useEffect, useState } from 'react';
import {
  NOME_TEMA,
  TEMI,
  applicaTema,
  ascoltaSistema,
  leggiTema,
  salvaTema,
  type Tema,
} from '@sagra-mazzocco/shared/tema';

const SIMBOLO: Record<Tema, string> = { chiaro: '☀', scuro: '☾', sistema: '◐' };

/** Sfondo chiaro o scuro, a scelta di chi usa l'app. La scelta resta su questo
 * dispositivo: al campo sportivo il tablet della cassa può volere lo scuro
 * senza che cambi per tutti gli altri. */
export function SelettoreTema() {
  const [tema, setTema] = useState<Tema>(leggiTema);

  useEffect(() => {
    applicaTema(tema);
  }, [tema]);

  // Con "Automatico" il tema deve seguire il dispositivo anche ad app aperta,
  // per esempio quando scatta la modalità notte.
  useEffect(() => {
    if (tema !== 'sistema') return;
    return ascoltaSistema(() => applicaTema('sistema'));
  }, [tema]);

  function scegli(nuovo: Tema) {
    salvaTema(nuovo);
    setTema(nuovo);
  }

  return (
    <div className="selettore-tema" role="group" aria-label="Sfondo">
      {TEMI.map((t) => (
        <button
          key={t}
          type="button"
          className={t === tema ? 'attivo' : ''}
          aria-pressed={t === tema}
          title={`Sfondo: ${NOME_TEMA[t].toLowerCase()}`}
          onClick={() => scegli(t)}
        >
          <span aria-hidden="true">{SIMBOLO[t]}</span>
          <span className="etichetta">{NOME_TEMA[t]}</span>
        </button>
      ))}
    </div>
  );
}
