import { signOut } from 'firebase/auth';
import { useState } from 'react';
import './App.css';
import { ConfermaBozza } from './components/ConfermaBozza';
import { FineSerata } from './components/FineSerata';
import { Login } from './components/Login';
import { NuovoOrdine } from './components/NuovoOrdine';
import { useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';

const SCHEDE = ['Nuovo ordine', 'Conferma bozza', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

function App() {
  const { utente, caricato } = useUtenteAutenticato();
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');

  if (!caricato) return null;
  if (!utente) return <Login />;

  return (
    <div className="app-cassa">
      <header>
        <nav>
          {SCHEDE.map((s) => (
            <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
              {s}
            </button>
          ))}
        </nav>
        <div className="utente">
          <span>{utente.email}</span>
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
