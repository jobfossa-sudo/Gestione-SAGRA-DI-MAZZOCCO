// La logica della tombola, senza niente di grafico: così si può provare da sola.

export const QUANTI = 90;
export const COLONNE = 10;

/** Un intero a caso in [0, massimo), scelto con il generatore del browser
 * (crypto) e non con Math.random: per un'estrazione davanti al pubblico
 * conta che nessuno possa prevederla. Senza bias: si scartano i valori che
 * non dividono in parti uguali. */
export function interoACaso(massimo: number): number {
  const limite = Math.floor(0x100000000 / massimo) * massimo;
  const uno = new Uint32Array(1);
  do crypto.getRandomValues(uno);
  while (uno[0] >= limite);
  return uno[0] % massimo;
}

/** Il numero estratto fra quelli ancora nel sacchetto, o null se è vuoto. */
export function estrai(estratti: readonly number[]): number | null {
  const rimasti: number[] = [];
  for (let n = 1; n <= QUANTI; n++) if (!estratti.includes(n)) rimasti.push(n);
  return rimasti.length === 0 ? null : rimasti[interoACaso(rimasti.length)];
}

const CHIAVE = 'tombola-estratti';

/** Le estrazioni si ricordano nel browser: una pagina ricaricata per sbaglio
 * non deve far ripartire la partita. */
export function leggiEstratti(): number[] {
  try {
    const valore: unknown = JSON.parse(localStorage.getItem(CHIAVE) ?? '[]');
    if (!Array.isArray(valore)) return [];
    const buoni = valore.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= QUANTI);
    return [...new Set(buoni)];
  } catch {
    return [];
  }
}

export function salvaEstratti(estratti: readonly number[]): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(estratti));
  } catch {
    // senza memoria del browser la partita vale solo finché la pagina resta aperta
  }
}
