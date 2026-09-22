// Grandezza delle scritte, condivisa da tutte le app della sagra.
//
// Sta in un file a parte per lo stesso motivo di tema.ts: tocca il browser
// (localStorage, il documento), e index.ts finisce anche dentro le Cloud
// Functions, dove niente di tutto questo esiste. Qui non si usa React: la
// cartella shared non ce l'ha fra le sue dipendenze, ogni app ci costruisce
// sopra il proprio pulsante.
//
// Funziona perché quasi tutte le misure dei fogli di stile sono in rem, cioè
// in multipli di questa: cambiandola si alza o si abbassa l'app intera —
// scritte, tasti, riquadri — e non solo il testo, che da solo sborderebbe.
//
// Chi la applica all'apertura è lo scriptino in index.html, che gira prima
// che la pagina venga disegnata: così non si vede la pagina saltare da una
// misura all'altra a ogni avvio.

/** Le misure disponibili, in pixel. Sono poche e distanti fra loro apposta:
 * un passo si deve vedere, altrimenti si preme il tasto cinque volte senza
 * capire se sta succedendo qualcosa. */
export const MISURE = [15, 17, 19, 21] as const;

export type Misura = (typeof MISURE)[number];

/** Quella di partenza: un po' più dei 16px consueti, perché alla cassa si
 * legge di sera e di fretta. */
export const MISURA_NORMALE: Misura = 17;

export const NOME_MISURA: Record<Misura, string> = {
  15: 'Piccolo',
  17: 'Normale',
  19: 'Grande',
  21: 'Molto grande',
};

/** Dove si ricorda la scelta. È una preferenza di questo dispositivo, non
 * dell'account: chi ha la vista stanca ingrandisce sul suo tablet senza
 * cambiarla a tutti gli altri. Stessa chiave dello scriptino in index.html. */
const CHIAVE = 'carattere';

function valida(numero: number): Misura | null {
  return (MISURE as readonly number[]).includes(numero) ? (numero as Misura) : null;
}

export function leggiCarattere(): Misura {
  try {
    return valida(Number(localStorage.getItem(CHIAVE))) ?? MISURA_NORMALE;
  } catch {
    // In alcune impostazioni del browser leggere è vietato: si tira dritto.
    return MISURA_NORMALE;
  }
}

export function salvaCarattere(misura: Misura): void {
  try {
    if (misura === MISURA_NORMALE) localStorage.removeItem(CHIAVE);
    else localStorage.setItem(CHIAVE, String(misura));
  } catch {
    // Se il browser non lascia scrivere, la scelta vale per questa sessione.
  }
}

/** Scrive la misura sul documento. Va sull'elemento radice perché è lui che
 * dà il valore al rem. */
export function applicaCarattere(misura: Misura): void {
  document.documentElement.style.fontSize = `${misura}px`;
}

/** La misura che si ottiene premendo il tasto: -1 rimpicciolisce, +1
 * ingrandisce. Agli estremi restituisce quella di partenza, così il pulsante
 * sa di doversi spegnere. */
export function misuraVicina(misura: Misura, passi: number): Misura {
  const indice = MISURE.indexOf(misura);
  const nuovo = Math.min(MISURE.length - 1, Math.max(0, indice + passi));
  return MISURE[nuovo];
}
