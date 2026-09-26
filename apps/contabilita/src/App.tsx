import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { edizioneDiSerata, idSerata } from '@sagra-mazzocco/shared';
import { Chiusura } from './components/Chiusura';
import { Entrate } from './components/Entrate';
import { Login } from './components/Login';
import { Presenze } from './components/Presenze';
import { Report } from './components/Report';
import { SceltaSerata } from './components/SceltaSerata';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { Serata } from './components/Serata';
import { Uscite } from './components/Uscite';
import { useSerate, useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';

const SCHEDE = ['Serata', 'Chiusura', 'Uscite', 'Entrate extra', 'Presenze', 'Report'] as const;
type Scheda = (typeof SCHEDE)[number];

/** Le schede che parlano di una sera precisa. Le altre guardano l'edizione
 * intera, e il selettore della serata lì non vuol dire niente. */
const SCHEDE_DI_SERATA: Scheda[] = ['Serata', 'Chiusura', 'Presenze'];

function App() {
  const { utente, permessi, caricato } = useUtenteAutenticato();

  if (!caricato) return null;
  if (!utente) return <Login />;

  const contabile = permessi.amministratore === true || (permessi.contabilita ?? []).includes('contabile');

  if (!contabile) {
    return (
      <div className="login">
        <div className="login-intro">
          <span className="occhiello">Sagra di Mazzocco</span>
          <h1>Nessun accesso</h1>
          <p>
            Il tuo account non ha un ruolo in Contabilità. Chiedi all'amministratore di assegnartelo, poi accedi di
            nuovo.
          </p>
        </div>
        <SelettoreCarattere />
        <SelettoreTema />
        <button type="button" onClick={() => signOut(auth)}>
          Esci
        </button>
      </div>
    );
  }

  return <Conti nome={utente.displayName ?? ''} amministratore={permessi.amministratore === true} />;
}

/** L'app vera e propria. Sta qui dentro, e non in App, perché i suoi ascolti
 * di Firestore devono partire a permessi già in mano. */
function Conti({ nome, amministratore }: { nome: string; amministratore: boolean }) {
  const serate = useSerate();
  const [scheda, setScheda] = useState<Scheda>('Serata');
  const [serataScelta, setSerataScelta] = useState<string | null>(null);

  // Si parte dalla serata in corso se esiste, altrimenti dall'ultima che c'è
  // stata: riaprendo l'app il giorno dopo si trova già la sera giusta.
  const oggi = idSerata();
  const serataId = serataScelta ?? (serate.some((s) => s.id === oggi) ? oggi : (serate[0]?.id ?? null));
  const edizioneId = edizioneDiSerata(serataId ?? oggi);

  return (
    <div className="app-contabilita">
      <header>
        <div className="marchio">
          <h1>Sagra di Mazzocco · Contabilità</h1>
          <p>Quanto è entrato, quanto è uscito, cosa resta</p>
        </div>
        <div className="utente">
          <span>
            {nome} · {amministratore ? 'Amministratore' : 'Contabile'}
          </span>
          <SelettoreCarattere />
          <SelettoreTema />
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>

      <nav className="schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
          </button>
        ))}
      </nav>

      {SCHEDE_DI_SERATA.includes(scheda) && (
        <SceltaSerata serate={serate} scelta={serataId} onCambia={setSerataScelta} />
      )}

      <main>
        {serate.length === 0 ? (
          <p className="vuoto">
            Non c'è ancora nessuna serata. Le serate le apre l'app Comande: quando la prima sagra comincia, qui
            compaiono i conti.
          </p>
        ) : (
          <>
            {scheda === 'Serata' && <Serata serataId={serataId} edizioneId={edizioneId} />}
            {scheda === 'Chiusura' && <Chiusura serataId={serataId} nome={nome} />}
            {scheda === 'Uscite' && <Uscite edizioneId={edizioneId} serate={serate} />}
            {scheda === 'Entrate extra' && <Entrate edizioneId={edizioneId} serate={serate} />}
            {scheda === 'Presenze' && <Presenze serataId={serataId} />}
            {scheda === 'Report' && <Report edizioneId={edizioneId} serate={serate} />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
