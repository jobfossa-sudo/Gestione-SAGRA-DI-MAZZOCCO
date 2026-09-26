export function euro(valore: number): string {
  return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Come euro(), ma con il segno anche quando è positivo: negli scarti di cassa
 * "+4,00" e "4,00" vogliono dire cose diverse, e la seconda si legge come "va
 * tutto bene". */
export function euroConSegno(valore: number): string {
  if (valore === 0) return euro(0);
  return `${valore > 0 ? '+' : '−'}${euro(Math.abs(valore))}`;
}

/** Accetta "12,50", "12.5", "12". Null se non è un importo valido. */
export function importoDaTesto(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(',', '.');
  const numero = Number(pulito);
  if (pulito === '' || Number.isNaN(numero)) return null;
  return Math.round(numero * 100) / 100;
}
