import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { Archivio } from './components/Archivio';
import { Login } from './components/Login';
import { NuovoUtente } from './components/NuovoUtente';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { TabellaUtenti } from './components/TabellaUtenti';
import { useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';

function App() {
  const { utente, permessi, caricato } = useUtenteAutenticato();

  if (!caricato) return null;
  if (!utente) return <Login />;

  if (!permessi.amministratore) {
    return (
      <div className="login">
        <div className="login-intro">
          <span className="occhiello">Sagra di Mazzocco</span>
          <h1>Nessun accesso</h1>
          <p>La gestione degli utenti è riservata all'amministratore.</p>
        </div>
        <SelettoreCarattere />
        <SelettoreTema />
        <button type="button" onClick={() => signOut(auth)}>
          Esci
        </button>
      </div>
    );
  }

  return (
    <div className="app-utenti">
      <header>
        <div className="marchio">
          <h1>Sagra di Mazzocco · Utenti</h1>
          <p>Le persone della sagra e il ruolo di ciascuna</p>
        </div>
        <div className="utente">
          <span>{utente.displayName} · Amministratore</span>
          <SelettoreCarattere />
          <SelettoreTema />
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>
      <Gestione uidCorrente={utente.uid} />
    </div>
  );
}

const SCHEDE = ['Persone', 'Archivio'] as const;
type Scheda = (typeof SCHEDE)[number];

/** Le due schede dell'amministratore. Stanno qui dentro, e non in App, perché
 * App esce prima per chi non è amministratore e lo stato della scheda non
 * può stare dopo un'uscita anticipata. */
function Gestione({ uidCorrente }: { uidCorrente: string }) {
  const [scheda, setScheda] = useState<Scheda>('Persone');

  return (
    <>
      <nav className="schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
          </button>
        ))}
      </nav>
      <main>
        {scheda === 'Persone' ? (
          <>
            <NuovoUtente />
            <section className="elenco">
              <h2>Persone</h2>
              <p className="spiegazione">
                Le modifiche hanno effetto subito: chi è collegato viene disconnesso e al rientro trova il nuovo ruolo. Chi non ha un N. utente non entra nelle app: è in elenco per le presenze.
              </p>
              <TabellaUtenti uidCorrente={uidCorrente} />
            </section>
          </>
        ) : (
          <Archivio />
        )}
      </main>
    </>
  );
}

export default App;
