import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { NOME_RUOLO_COMANDE } from '@sagra-mazzocco/shared';
import './App.css';
import { ConfermaBozza } from './components/ConfermaBozza';
import { FineSerata } from './components/FineSerata';
import { Login } from './components/Login';
import { NuovoOrdine } from './components/NuovoOrdine';
import { useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';
import { SERATA_ID_OGGI } from './services/serata';

const SCHEDE = ['Nuovo ordine', 'Conferma bozza', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

const dataSerata = new Date(SERATA_ID_OGGI).toLocaleDateString('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function App() {
  const { utente, permessi, caricato } = useUtenteAutenticato();
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');

  if (!caricato) return null;
  if (!utente) return <Login />;

  if (!permessi.amministratore && !permessi.comande) {
    return (
      <div className="login">
        <div className="login-intro">
          <span className="occhiello">Sagra di Mazzocco</span>
          <h1>Nessun accesso</h1>
          <p>
            Il tuo account non ha un ruolo in Comande. Chiedi all'amministratore di assegnartelo, poi accedi di
            nuovo.
          </p>
        </div>
        <button type="button" onClick={() => signOut(auth)}>
          Esci
        </button>
      </div>
    );
  }

  const nomeRuolo = permessi.amministratore ? 'Amministratore' : NOME_RUOLO_COMANDE[permessi.comande!];

  return (
    <div className="app-cassa">
      <header>
        <div className="marchio">
          <h1>Sagra di Mazzocco · Cassa</h1>
          <p>Serata di {dataSerata}</p>
        </div>
        <nav>
          {SCHEDE.map((s) => (
            <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
              {s}
            </button>
          ))}
        </nav>
        <div className="utente">
          <span>
            {utente.displayName} · {nomeRuolo}
          </span>
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>
      <main>
        {scheda === 'Nuovo ordine' && <NuovoOrdine />}
        {scheda === 'Conferma bozza' && <ConfermaBozza />}
        {scheda === 'Fine serata' && <FineSerata />}
      </main>
    </div>
  );
}

export default App;
