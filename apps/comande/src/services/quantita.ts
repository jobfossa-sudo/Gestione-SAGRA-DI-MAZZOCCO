/** Le quantità dei componenti si scrivono come si parla: "2", "0,5" oppure
 * "1/2". Restituisce null se non è una quantità positiva. */
export function quantitaDaTesto(testo: string): number | null {
  const pulito = testo.trim().replace(',', '.');
  const frazione = pulito.match(/^(\d+)\s*\/\s*(\d+)$/);
  const valore = frazione ? Number(frazione[1]) / Number(frazione[2]) : Number(pulito);
  if (pulito === '' || !Number.isFinite(valore) || valore <= 0) return null;
  return Math.round(valore * 1000) / 1000;
}

/** 0.5 diventa "0,5"; niente code di decimali dovute ai conti. */
export function quantitaInTesto(valore: number): string {
  return String(Math.round(valore * 1000) / 1000).replace('.', ',');
}
