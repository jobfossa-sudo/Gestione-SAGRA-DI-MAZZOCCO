import { useState, useSyncExternalStore } from 'react';
import {
  ascoltaApp,
  dispositivo,
  eInstallata,
  installaApp,
  puoInstallare,
  type Dispositivo,
} from '@sagra-mazzocco/shared/pwa';

const ISTRUZIONI: Record<Dispositivo, { nome: string; passi: React.ReactNode }> = {
  iphone: {
    nome: 'iPhone e iPad (Safari)',
    passi: (
      <>
        Tocca <b>Condividi</b> (il quadrato con la freccia in su), poi <b>Aggiungi alla schermata Home</b> e{' '}
        <b>Aggiungi</b>.
      </>
    ),
  },
  android: {
    nome: 'Telefono o tablet Android (Chrome)',
    passi: (
      <>
        Menù <b>⋮</b> in alto a destra, poi <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>).
      </>
    ),
  },
  pc: {
    nome: 'Computer (Chrome o Edge)',
    passi: (
      <>
        Nella barra degli indirizzi, a destra, clicca il simbolo <b>Installa</b> (uno schermo con una freccia). Se non
        c'è: menù <b>⋮</b> di Chrome, poi <b>Installa…</b>; in Edge menù <b>…</b>, poi <b>App → Installa questo sito
        come app</b>.
      </>
    ),
  },
};

/** Come mettere l'app della sagra sul dispositivo: un tasto dove il browser
 * lo permette (Chrome, Edge), altrimenti le istruzioni per quel dispositivo.
 * Non si vede quando si sta già usando l'app installata. */
export function Installazione() {
  const installabile = useSyncExternalStore(ascoltaApp, puoInstallare);
  const [esito, setEsito] = useState<string | null>(null);
  const questo = dispositivo();
  const altri = (Object.keys(ISTRUZIONI) as Dispositivo[]).filter((d) => d !== questo);

  if (eInstallata()) return null;

  return (
    <section className="installazione">
      <h2>Installa l'app su questo dispositivo</h2>
      <p className="spiegazione">
        Installata, l'app della sagra si apre dalla sua icona, a tutto schermo, e si apre anche quando la rete cade.
        È una sola per tutto: menù, Comande, Contabilità e Utenti.
      </p>
      {installabile ? (
        <button
          type="button"
          className="bottone-principale"
          onClick={async () => setEsito((await installaApp()) ? 'Installata: la trovi tra le tue app.' : null)}
        >
          Installa l'app
        </button>
      ) : (
        <p className="passi-installazione">
          <b>{ISTRUZIONI[questo].nome}:</b> {ISTRUZIONI[questo].passi}
        </p>
      )}
      {esito && <p className="successo">{esito}</p>}
      <details>
        <summary>Su altri dispositivi</summary>
        {altri.map((d) => (
          <p key={d} className="passi-installazione">
            <b>{ISTRUZIONI[d].nome}:</b> {ISTRUZIONI[d].passi}
          </p>
        ))}
      </details>
    </section>
  );
}
