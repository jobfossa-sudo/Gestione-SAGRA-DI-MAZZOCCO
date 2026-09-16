import { signOut } from 'firebase/auth';
import { Login } from './components/Login';
import { NuovoUtente } from './components/NuovoUtente';
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
          <p>Chi può entrare, in quale app e con quale ruolo</p>
        </div>
        <div className="utente">
          <span>{utente.displayName} · Amministratore</span>
          <SelettoreTema />
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>
      <main>
        <NuovoUtente />
        <section className="elenco">
          <h2>Utenti</h2>
          <p className="spiegazione">
            Le modifiche hanno effetto subito: chi è collegato viene disconnesso e al rientro trova i nuovi permessi.
          </p>
          <TabellaUtenti uidCorrente={utente.uid} />
        </section>
      </main>
    </div>
  );
}

export default App;
