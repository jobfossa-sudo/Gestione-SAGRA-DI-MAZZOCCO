// Tema chiaro/scuro, condiviso da tutte le app della sagra.
//
// Sta in un file a parte e non in index.ts perché tocca il browser
// (localStorage, il documento): index.ts finisce anche dentro le Cloud
// Functions, dove niente di tutto questo esiste. Qui non si usa React: la
// cartella shared non ce l'ha fra le sue dipendenze, ogni app ci costruisce
// sopra il proprio pulsante.
//
// Chi applica il tema all'apertura è lo scriptino in index.html, che gira
// prima che la pagina venga disegnata: così chi usa lo sfondo scuro non vede
// il lampo bianco della pagina chiara.

/** "sistema" segue l'impostazione del telefono o del computer. */
export type Tema = 'chiaro' | 'scuro' | 'sistema';

export const TEMI: Tema[] = ['chiaro', 'scuro', 'sistema'];

export const NOME_TEMA: Record<Tema, string> = {
  chiaro: 'Chiaro',
  scuro: 'Scuro',
  sistema: 'Automatico',
};

/** Dove si ricorda la scelta. È una preferenza di questo dispositivo, non
 * dell'account: la cassiera può volere lo scuro sul suo tablet senza cambiarlo
 * a tutti gli altri. Stessa chiave dello scriptino in index.html. */
const CHIAVE = 'tema';

export function leggiTema(): Tema {
  try {
    const salvato = localStorage.getItem(CHIAVE);
    return salvato === 'chiaro' || salvato === 'scuro' ? salvato : 'sistema';
  } catch {
    // In alcune impostazioni del browser leggere è vietato: si tira dritto.
    return 'sistema';
  }
}

export function salvaTema(tema: Tema): void {
  try {
    if (tema === 'sistema') localStorage.removeItem(CHIAVE);
    else localStorage.setItem(CHIAVE, tema);
  } catch {
    // Se il browser non lascia scrivere, la scelta vale per questa sessione.
  }
}

function sistemaEScuro(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Scrive sul documento il tema effettivo: è l'attributo che il foglio di
 * stile guarda per decidere i colori. */
export function applicaTema(tema: Tema): void {
  const scuro = tema === 'scuro' || (tema === 'sistema' && sistemaEScuro());
  document.documentElement.dataset.tema = scuro ? 'scuro' : 'chiaro';
}

/** Avvisa quando il dispositivo passa da chiaro a scuro o viceversa, per
 * esempio allo scattare della modalità notte. Serve solo con "Automatico".
 * Restituisce la funzione per smettere di ascoltare. */
export function ascoltaSistema(alCambio: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const media = matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', alCambio);
  return () => media.removeEventListener('change', alCambio);
}
