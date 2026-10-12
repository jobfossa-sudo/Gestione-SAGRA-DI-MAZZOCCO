/** Le icone delle app: disegni a linee, nel colore dell'app (prendono
 * currentColor), leggibili sia nel tema chiaro sia in quello scuro. Sono
 * scritte qui e non scaricate da fuori: il menù deve aprirsi anche quando la
 * rete della sagra va e viene. */

const tratto = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icona({ children, titolo }: { children: React.ReactNode; titolo: string }) {
  return (
    <svg viewBox="0 0 48 48" className="icona-app" role="img" aria-label={titolo}>
      {children}
    </svg>
  );
}

/** Comande: il piatto, con forchetta e coltello. */
export function IconaComande() {
  return (
    <Icona titolo="Comande">
      <g {...tratto}>
        <circle cx="24" cy="25" r="11" />
        <circle cx="24" cy="25" r="6.5" />
        <path d="M7 9v8a3 3 0 0 0 3 3v19" />
        <path d="M10 9v8" />
        <path d="M13 9v8a3 3 0 0 1-3 3" />
        <path d="M40 39V9c-3 2-4.5 6-4.5 11 0 2.5 1.5 3.5 4.5 3.5" />
      </g>
    </Icona>
  );
}

/** Contabilità: le colonne di un grafico che sale, con la moneta. */
export function IconaContabilita() {
  return (
    <Icona titolo="Contabilità">
      <g {...tratto}>
        <path d="M7 40h34" />
        <rect x="10" y="27" width="6" height="13" rx="1.5" />
        <rect x="21" y="20" width="6" height="20" rx="1.5" />
        <rect x="32" y="12" width="6" height="28" rx="1.5" />
        <circle cx="14" cy="12" r="5.5" />
        <path d="M15.8 9.8a3 3 0 1 0 0 4.4M10.8 11.2h4M10.8 12.8h4" />
      </g>
    </Icona>
  );
}

/** Utenti: due persone, una davanti all'altra. */
export function IconaUtenti() {
  return (
    <Icona titolo="Utenti">
      <g {...tratto}>
        <circle cx="19" cy="17" r="6" />
        <path d="M8 38c0-6.5 5-11 11-11s11 4.5 11 11" />
        <circle cx="32.5" cy="14.5" r="4.5" />
        <path d="M33 23.5c4.5 0.4 8 4.2 8 9" />
      </g>
    </Icona>
  );
}

/** Magazzino: la scatola chiusa. */
export function IconaMagazzino() {
  return (
    <Icona titolo="Magazzino">
      <g {...tratto}>
        <path d="M24 6 40 14v20L24 42 8 34V14Z" />
        <path d="M8 14l16 8 16-8" />
        <path d="M24 22v20" />
        <path d="M16 10l16 8v7" />
      </g>
    </Icona>
  );
}

/** I codici QR: i tre quadrati d'angolo e qualche puntino. */
export function IconaQr() {
  return (
    <Icona titolo="Codici QR">
      <g {...tratto}>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <rect x="28" y="8" width="12" height="12" rx="2" />
        <rect x="8" y="28" width="12" height="12" rx="2" />
        <path d="M28 28h5v5h-5zM35 35h5v5h-5zM28 38v2M38 28h2" />
      </g>
      <g fill="currentColor">
        <rect x="12" y="12" width="4" height="4" rx="0.8" />
        <rect x="32" y="12" width="4" height="4" rx="0.8" />
        <rect x="12" y="32" width="4" height="4" rx="0.8" />
      </g>
    </Icona>
  );
}

/** Il lucchetto delle app a cui non si ha accesso. */
export function Lucchetto() {
  return (
    <svg viewBox="0 0 24 24" className="lucchetto" aria-hidden="true">
      <g {...tratto} strokeWidth={2}>
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </g>
    </svg>
  );
}
