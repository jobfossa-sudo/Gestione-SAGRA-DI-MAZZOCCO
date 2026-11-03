// L'app installabile, condivisa da tutte le app della sagra.
//
// Il sito intero è UNA sola app: il menù alla radice e le app nelle loro
// cartelle, con un'icona sola e un accesso solo. Un solo service worker,
// /sw.js, costruito da scripts/costruisci.mjs sopra il sito completo, tiene
// nel dispositivo una copia di tutte le pagine: così l'app si apre anche
// quando la rete della sagra cade.
//
// Come tema.ts sta in un file a parte e non in index.ts, perché tocca il
// browser, e non usa React: ogni app ci costruisce sopra il suo avviso.

type Ascoltatore = () => void;

const ascoltatori = new Set<Ascoltatore>();
const avvisa = () => ascoltatori.forEach((ascoltatore) => ascoltatore());

/** Chi vuole sapere quando cambia qualcosa (versione nuova pronta, app
 * installabile o installata). Restituisce la funzione per smettere. */
export function ascoltaApp(ascoltatore: Ascoltatore): () => void {
  ascoltatori.add(ascoltatore);
  return () => ascoltatori.delete(ascoltatore);
}

// ---------------------------------------------------------------------------
// Versione nuova
// ---------------------------------------------------------------------------

let inAttesa: ServiceWorker | null = null;

/** Mette al lavoro la copia dell'app nel dispositivo. Va chiamata solo
 * nell'app pubblicata: in sviluppo ogni app ha la sua porta e /sw.js non c'è.
 * `radice` è l'indirizzo del menù delle app ("/"). */
export function registraApp(radice: string): void {
  if (!('serviceWorker' in navigator)) return;

  // Quando una versione nuova prende il posto di quella vecchia, la pagina si
  // ricarica per usarla. Non al primo arrivo, quando prima non c'era niente:
  // lì non c'è niente da cambiare e un ricaricamento sarebbe solo un salto.
  let guardia = navigator.serviceWorker.controller;
  let ricaricata = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const cEraGia = guardia !== null;
    guardia = navigator.serviceWorker.controller;
    if (cEraGia && !ricaricata) {
      ricaricata = true;
      window.location.reload();
    }
  });

  const proponi = (versione: ServiceWorker) => {
    inAttesa = versione;
    avvisa();
  };

  window.addEventListener('load', async () => {
    let registrazione: ServiceWorkerRegistration;
    try {
      registrazione = await navigator.serviceWorker.register(`${radice}sw.js`, { scope: radice });
    } catch {
      // Senza service worker l'app funziona lo stesso, solo non si apre senza rete.
      return;
    }
    if (registrazione.waiting && navigator.serviceWorker.controller) proponi(registrazione.waiting);
    registrazione.addEventListener('updatefound', () => {
      const nuova = registrazione.installing;
      nuova?.addEventListener('statechange', () => {
        if (nuova.state === 'installed' && navigator.serviceWorker.controller) proponi(nuova);
      });
    });
    // Una cassa resta aperta tutta la sera: ogni ora si guarda se nel
    // frattempo è stata pubblicata una versione nuova.
    setInterval(() => registrazione.update().catch(() => {}), 60 * 60 * 1000);
  });
}

/** C'è una versione nuova scaricata che aspetta il via. Non parte da sola:
 * un ricaricamento improvviso farebbe perdere l'ordine che si sta battendo. */
export function versioneNuovaPronta(): boolean {
  return inAttesa !== null;
}

/** Il via alla versione nuova: la pagina si ricarica appena è pronta. */
export function aggiornaApp(): void {
  inAttesa?.postMessage({ type: 'SKIP_WAITING' });
}

// ---------------------------------------------------------------------------
// Installazione
// ---------------------------------------------------------------------------

/** L'evento con cui Chrome ed Edge offrono di installare l'app. Non è ancora
 * nei tipi del browser di TypeScript. */
interface RichiestaInstallazione extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let richiesta: RichiestaInstallazione | null = null;

if (typeof window !== 'undefined') {
  // Arriva presto, anche prima che la pagina sia disegnata: si tiene da parte
  // per il tasto "Installa" del menù delle app.
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault();
    richiesta = evento as RichiestaInstallazione;
    avvisa();
  });
  window.addEventListener('appinstalled', () => {
    richiesta = null;
    avvisa();
  });
}

/** Il browser permette di installare l'app con un tasto (Chrome, Edge). Su
 * iPhone no: lì si fa da Condividi → Aggiungi alla schermata Home. */
export function puoInstallare(): boolean {
  return richiesta !== null;
}

/** Apre la richiesta del browser. Vero se la persona ha detto sì. */
export async function installaApp(): Promise<boolean> {
  if (!richiesta) return false;
  const questa = richiesta;
  richiesta = null;
  await questa.prompt();
  const { outcome } = await questa.userChoice;
  avvisa();
  return outcome === 'accepted';
}

/** Si sta usando l'app installata, aperta dalla sua icona. */
export function eInstallata(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type Dispositivo = 'iphone' | 'android' | 'pc';

/** Su che cosa si sta guardando la pagina, per mostrare le istruzioni giuste. */
export function dispositivo(): Dispositivo {
  const agente = navigator.userAgent;
  // L'iPad recente si presenta come un Mac, ma ha lo schermo da toccare.
  if (/iPhone|iPad|iPod/.test(agente) || (/Macintosh/.test(agente) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(agente)) return 'android';
  return 'pc';
}
