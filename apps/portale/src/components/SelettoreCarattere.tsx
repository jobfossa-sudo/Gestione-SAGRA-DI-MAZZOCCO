import { useEffect, useState } from 'react';
import {
  MISURA_NORMALE,
  MISURE,
  NOME_MISURA,
  applicaCarattere,
  leggiCarattere,
  misuraVicina,
  salvaCarattere,
  type Misura,
} from '@sagra-mazzocco/shared/carattere';

/** Scritte più piccole o più grandi, a scelta di chi usa l'app. La scelta
 * resta su questo dispositivo: chi ha la vista stanca ingrandisce sul suo
 * tablet senza cambiarla a tutti gli altri. Il tasto in mezzo riporta alla
 * misura normale — serve a chi si è spinto troppo in là e non ritrova più la
 * strada indietro. */
export function SelettoreCarattere() {
  const [misura, setMisura] = useState<Misura>(leggiCarattere);

  useEffect(() => {
    applicaCarattere(misura);
  }, [misura]);

  function scegli(nuova: Misura) {
    salvaCarattere(nuova);
    setMisura(nuova);
  }

  const alMinimo = misura === MISURE[0];
  const alMassimo = misura === MISURE[MISURE.length - 1];

  return (
    <div className="selettore-tema selettore-carattere" role="group" aria-label="Grandezza delle scritte">
      <button
        type="button"
        disabled={alMinimo}
        title="Scritte più piccole"
        onClick={() => scegli(misuraVicina(misura, -1))}
      >
        <span aria-hidden="true" className="a-piccola">
          A−
        </span>
        <span className="etichetta">Scritte più piccole</span>
      </button>
      <button
        type="button"
        className={misura === MISURA_NORMALE ? 'attivo' : ''}
        aria-pressed={misura === MISURA_NORMALE}
        title={`Grandezza: ${NOME_MISURA[misura].toLowerCase()} — torna a normale`}
        onClick={() => scegli(MISURA_NORMALE)}
      >
        <span aria-hidden="true">A</span>
        <span className="etichetta">Grandezza normale</span>
      </button>
      <button
        type="button"
        disabled={alMassimo}
        title="Scritte più grandi"
        onClick={() => scegli(misuraVicina(misura, 1))}
      >
        <span aria-hidden="true" className="a-grande">
          A+
        </span>
        <span className="etichetta">Scritte più grandi</span>
      </button>
    </div>
  );
}
