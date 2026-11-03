import { useState, useSyncExternalStore } from 'react';
import { aggiornaApp, ascoltaApp, versioneNuovaPronta } from '@sagra-mazzocco/shared/pwa';

/** Quando è stata pubblicata una versione nuova dell'app la propone, invece
 * di ricaricare da sola: un ricaricamento improvviso farebbe perdere l'ordine
 * che si sta battendo. "Più tardi" la nasconde fino alla prossima apertura. */
export function AvvisoAggiornamento() {
  const pronta = useSyncExternalStore(ascoltaApp, versioneNuovaPronta);
  const [rimandata, setRimandata] = useState(false);

  if (!pronta || rimandata) return null;

  return (
    <div className="avviso-aggiornamento" role="status">
      <span>È pronta una nuova versione dell'app.</span>
      <button type="button" className="bottone-principale" onClick={aggiornaApp}>
        Aggiorna
      </button>
      <button type="button" onClick={() => setRimandata(true)}>
        Più tardi
      </button>
    </div>
  );
}
