import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import type { Permessi } from '@sagra-mazzocco/shared';
import { AreaStampa } from './components/Cartelli';
import { CodiciQr } from './components/CodiciQr';
import { Login } from './components/Login';
import { Menu } from './components/Menu';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { auth } from './services/firebase';

function useAccesso(): { utente: User | null; permessi: Permessi; caricato: boolean } {
  const [stato, setStato] = useState<{ utente: User | null; permessi: Permessi; caricato: boolean }>({
    utente: null,
    permessi: {},
    caricato: false,
  });
  useEffect(
    () =>
      onAuthStateChanged(auth, async (utente) => {
        const permessi = utente ? ((await utente.getIdTokenResult()).claims as Permessi) : {};
        setStato({ utente, permessi, caricato: true });
      }),
    []
  );
  return stato;
}

/** La pagina che si vede: il menù, oppure i QR. Sta nell'indirizzo (#qr)
 * così il tasto "indietro" del telefono riporta al menù. */
function usePagina(): 'menu' | 'qr' {
  const leggi = (): 'menu' | 'qr' => (window.location.hash === '#qr' ? 'qr' : 'menu');
  const [pagina, setPagina] = useState(leggi);
  useEffect(() => {
    const cambia = () => setPagina(leggi());
    window.addEventListener('hashchange', cambia);
    return () => window.removeEventListener('hashchange', cambia);
  }, []);
  return pagina;
}

/** Il menù delle app: la porta d'ingresso di tutto. Ci si entra una volta
 * sola, e da qui si va in ogni app senza rientrare (pubblicate, stanno tutte
 * sotto lo stesso indirizzo e condividono l'accesso). */
function App() {
  const { utente, permessi, caricato } = useAccesso();
  const pagina = usePagina();

  if (!caricato) return null;
  if (!utente) return <Login />;

  const amministratore = permessi.amministratore === true;

  return (
    <div className="app-portale">
      <header>
        <div className="marchio">
          <h1>Sagra di Mazzocco</h1>
          <p>Le app della sagra</p>
        </div>
        <div className="utente">
          <span>
            {utente.displayName}
            {amministratore && ' · Amministratore'}
          </span>
          <SelettoreCarattere />
          <SelettoreTema />
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>
      {pagina === 'qr' ? <CodiciQr amministratore={amministratore} /> : <Menu permessi={permessi} />}
      <AreaStampa />
    </div>
  );
}

export default App;
