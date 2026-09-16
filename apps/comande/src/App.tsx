import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { NOME_RUOLO_COMANDE, type RuoloComande } from '@sagra-mazzocco/shared';
import './App.css';
import { AreaCassa } from './components/AreaCassa';
import { GestioneMenu } from './components/GestioneMenu';
import { Login } from './components/Login';
import { Pannelli } from './components/Pannelli';
import { Consegna } from './components/Consegna';
import { useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';
import { SERATA_ID_OGGI } from './services/serata';

/** Ogni area è visibile a chi ha uno dei ruoli indicati; l'amministratore
 * le vede tutte. */
const AREE = [
  { nome: 'Gestione menù', ruoli: [] as RuoloComande[], soloAmministratore: true, contenuto: GestioneMenu },
  { nome: 'Cassa', ruoli: ['cassa'] as RuoloComande[], soloAmministratore: false, contenuto: AreaCassa },
  { nome: 'Pannelli', ruoli: ['cucina', 'bevande'] as RuoloComande[], soloAmministratore: false, contenuto: Pannelli },
  { nome: 'Consegna', ruoli: ['consegna'] as RuoloComande[], soloAmministratore: false, contenuto: Consegna },
];

const dataSerata = new Date(SERATA_ID_OGGI).toLocaleDateString('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function App() {
  const { utente, permessi, caricato } = useUtenteAutenticato();
  const [areaAttiva, setAreaAttiva] = useState<string | null>(null);

  if (!caricato) return null;
  if (!utente) return <Login />;

  const ruoli = permessi.comande ?? [];
  const amministratore = permessi.amministratore === true;

  const areeVisibili = AREE.filter((area) =>
    amministratore ? true : !area.soloAmministratore && area.ruoli.some((ruolo) => ruoli.includes(ruolo))
  );

  if (areeVisibili.length === 0) {
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

  const area = areeVisibili.find((a) => a.nome === areaAttiva) ?? areeVisibili[0];
  const Contenuto = area.contenuto;

  const nomeRuolo = amministratore
    ? 'Amministratore'
    : ruoli.map((ruolo) => NOME_RUOLO_COMANDE[ruolo]).join(' · ');

  return (
    <div className="app-cassa">
      <header>
        <div className="marchio">
          <h1>Sagra di Mazzocco · Comande</h1>
          <p>Serata di {dataSerata}</p>
        </div>
        {areeVisibili.length > 1 && (
          <nav>
            {areeVisibili.map((a) => (
              <button
                key={a.nome}
                type="button"
                className={a.nome === area.nome ? 'attiva' : ''}
                onClick={() => setAreaAttiva(a.nome)}
              >
                {a.nome}
              </button>
            ))}
          </nav>
        )}
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
        <Contenuto amministratore={amministratore} />
      </main>
    </div>
  );
}

export default App;
