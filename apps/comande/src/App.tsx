import { signOut } from 'firebase/auth';
import { useState, type ComponentType } from 'react';
import { NOME_RUOLO_COMANDE, type RuoloComande } from '@sagra-mazzocco/shared';
import './App.css';
import { AreaCassa } from './components/AreaCassa';
import { AreaStampa } from './components/AreaStampa';
import { AvvisoRete } from './components/AvvisoRete';
import { AreaBanco } from './components/AreaBanco';
import { AvvisoBagni } from './components/AvvisoBagni';
import { Biglietti } from './components/Biglietti';
import { Composizioni } from './components/Composizioni';
import { GestioneMenu } from './components/GestioneMenu';
import { Login } from './components/Login';
import { MenuQr } from './components/MenuQr';
import { QrMenu } from './components/QrMenu';
import { SegnalaBagno } from './components/SegnalaBagno';
import { Pannelli } from './components/Pannelli';
import { Distribuzione } from './components/Distribuzione';
import { SelettoreCarattere } from './components/SelettoreCarattere';
import { SelettoreTema } from './components/SelettoreTema';
import { useUtenteAutenticato } from './hooks';
import { auth } from './services/firebase';
import { SERATA_ID_OGGI } from './services/serata';
import { menuDaIndirizzo } from './services/tavolo';
import { segnalazioneDaIndirizzo } from './services/bagni';

/** Ogni area è visibile a chi ha uno dei ruoli indicati; l'amministratore
 * le vede tutte. "larga" toglie il limite di larghezza: serve solo dove si
 * compila una tabella fitta di colonne, mentre le schermate che si leggono di
 * corsa restano centrate e strette, che si seguono meglio con l'occhio. */
/** Tutte le aree ricevono "amministratore", anche quelle che non se ne fanno
 * niente: senza un tipo dichiarato TypeScript lo deduce dall'elenco, e basta
 * che una smetta di usarlo perché non si possa più passare a nessuna. */
type Area = {
  nome: string;
  ruoli: RuoloComande[];
  soloAmministratore: boolean;
  contenuto: ComponentType<{ amministratore: boolean }>;
  larga: boolean;
};

const AREE: Area[] = [
  { nome: 'Gestione menù', ruoli: [] as RuoloComande[], soloAmministratore: true, contenuto: GestioneMenu, larga: true },
  { nome: 'Composizioni', ruoli: [] as RuoloComande[], soloAmministratore: true, contenuto: Composizioni, larga: true },
  { nome: 'Biglietti', ruoli: [] as RuoloComande[], soloAmministratore: true, contenuto: Biglietti, larga: true },
  { nome: 'QR', ruoli: [] as RuoloComande[], soloAmministratore: true, contenuto: QrMenu, larga: true },
  { nome: 'Cassa', ruoli: ['cassa'] as RuoloComande[], soloAmministratore: false, contenuto: AreaCassa, larga: false },
  { nome: 'Pannelli', ruoli: ['cucina', 'griglia', 'bar'] as RuoloComande[], soloAmministratore: false, contenuto: Pannelli, larga: false },
  { nome: 'Distribuzione', ruoli: ['distribuzione'] as RuoloComande[], soloAmministratore: false, contenuto: Distribuzione, larga: false },
  // I due banchi sono la stessa schermata con dentro un id diverso: quello che
  // li distingue sta tutto in AreaBanco, non qui.
  { nome: 'BAR', ruoli: ['bancoBar'] as RuoloComande[], soloAmministratore: false, contenuto: () => <AreaBanco banco="bar" />, larga: false },
  { nome: 'BEVANDE', ruoli: ['bancoBevande'] as RuoloComande[], soloAmministratore: false, contenuto: () => <AreaBanco banco="bevande" />, larga: false },
];

const dataSerata = new Date(SERATA_ID_OGGI).toLocaleDateString('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function App() {
  const { utente, permessi, caricato } = useUtenteAutenticato();
  const [areaAttiva, setAreaAttiva] = useState<string | null>(null);
  // Il tavolo nell'indirizzo vuol dire "sono un cliente, ho inquadrato il QR":
  // si apre il menù, senza accesso e senza niente del personale.
  const menuCliente = menuDaIndirizzo();
  // Il bagno nell'indirizzo vuol dire "sono un cliente, ho inquadrato il
  // cartello appeso in bagno": si apre l'elenco delle segnalazioni e nient'altro.
  const segnalazione = segnalazioneDaIndirizzo();

  if (segnalazione.attiva) return <SegnalaBagno bagno={segnalazione.bagno} />;

  if (menuCliente.attivo)
    return (
      <>
        <AvvisoRete />
        <MenuQr tavoloIniziale={menuCliente.tavolo} />
      </>
    );

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
        <SelettoreCarattere />
        <SelettoreTema />
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
      <AvvisoRete />
      <AvvisoBagni />
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
          <SelettoreCarattere />
          <SelettoreTema />
          <button type="button" onClick={() => signOut(auth)}>
            Esci
          </button>
        </div>
      </header>
      <main className={area.larga ? 'larga' : undefined}>
        <Contenuto amministratore={amministratore} />
      </main>
      {/* Invisibile sullo schermo: è il foglio che esce dalla stampante. */}
      <AreaStampa />
    </div>
  );
}

export default App;
