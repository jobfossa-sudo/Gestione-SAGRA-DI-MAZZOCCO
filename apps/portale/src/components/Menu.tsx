import { indirizzoApp, type AppSagra, type Permessi } from '@sagra-mazzocco/shared';
import { IconaComande, IconaContabilita, IconaMagazzino, IconaQr, IconaUtenti, Lucchetto } from './Icone';

interface Riquadro {
  id: Exclude<AppSagra, 'portale'> | 'qr';
  nome: string;
  descrizione: string;
  Icona: () => React.JSX.Element;
  /** Dove porta: un'altra app, oppure la pagina dei QR qui dentro. */
  destinazione: string;
  /** Null = si può entrare; altrimenti il motivo per cui il riquadro è spento. */
  spento: (permessi: Permessi) => string | null;
}

const SVILUPPO = import.meta.env.DEV;
const SENZA_ACCESSO = 'Non hai accesso';

/** Tutte le app si vedono sempre, anche quelle in cui non si entra: chi
 * lavora sa che esistono e a chi chiedere, e il menù è uguale per tutti. */
const RIQUADRI: Riquadro[] = [
  {
    id: 'comande',
    nome: 'Comande',
    descrizione: 'Cassa, cucina, distribuzione e banchi',
    Icona: IconaComande,
    destinazione: indirizzoApp('comande', SVILUPPO),
    spento: (p) => (p.amministratore || (p.comande ?? []).length > 0 ? null : SENZA_ACCESSO),
  },
  {
    id: 'contabilita',
    nome: 'Contabilità',
    descrizione: 'Incassi, spese, presenze e report',
    Icona: IconaContabilita,
    destinazione: indirizzoApp('contabilita', SVILUPPO),
    spento: (p) => (p.amministratore || (p.contabilita ?? []).includes('contabile') ? null : SENZA_ACCESSO),
  },
  {
    id: 'utenti',
    nome: 'Utenti',
    descrizione: 'Persone, ruoli e archivio delle edizioni',
    Icona: IconaUtenti,
    destinazione: indirizzoApp('utenti', SVILUPPO),
    spento: (p) => (p.amministratore ? null : SENZA_ACCESSO),
  },
  {
    id: 'magazzino',
    nome: 'Magazzino',
    descrizione: 'Cosa sta finendo e la lista della spesa',
    Icona: IconaMagazzino,
    destinazione: indirizzoApp('magazzino', SVILUPPO),
    spento: () => 'In arrivo',
  },
  {
    id: 'qr',
    nome: 'Codici QR',
    descrizione: 'Menù dei tavoli e bagni: da stampare o da mostrare',
    Icona: IconaQr,
    destinazione: '#qr',
    // Mostrarli a schermo serve a chiunque lavori; stampare resta
    // dell'amministratore, e lo decide la pagina dei QR.
    spento: () => null,
  },
];

export function Menu({ permessi }: { permessi: Permessi }) {
  return (
    <main className="menu-app">
      <h2>Scegli dove entrare</h2>
      <div className="griglia-app">
        {RIQUADRI.map(({ id, nome, descrizione, Icona, destinazione, spento }) => {
          const motivo = spento(permessi);
          const contenuto = (
            <>
              <span className="icona-riquadro">
                <Icona />
              </span>
              <span className="nome-app">{nome}</span>
              <span className="descrizione-app">{descrizione}</span>
              <span className="stato-app">
                {motivo ? (
                  <>
                    <Lucchetto /> {motivo}
                  </>
                ) : (
                  'Entra ▶'
                )}
              </span>
            </>
          );
          // Il riquadro spento non è un collegamento: non si clicca, non si
          // raggiunge col tasto Tab, e lo dice anche a chi usa un lettore.
          return motivo ? (
            <div key={id} className={`riquadro-app app-${id} spento`} aria-disabled="true">
              {contenuto}
            </div>
          ) : (
            <a key={id} className={`riquadro-app app-${id}`} href={destinazione}>
              {contenuto}
            </a>
          );
        })}
      </div>
    </main>
  );
}
