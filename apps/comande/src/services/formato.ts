export function euro(valore: number): string {
  return valore.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
}

/** Una durata scritta come la direbbe una persona: "45 s", "7 min",
 * "1 h 05 min". Si arrotonda al minuto perché sotto il minuto non interessa a
 * nessuno, tranne quando il minuto non è ancora passato. */
export function durata(millisecondi: number): string {
  const secondi = Math.round(millisecondi / 1000);
  if (secondi < 60) return `${secondi} s`;
  const minuti = Math.round(secondi / 60);
  if (minuti < 60) return `${minuti} min`;
  const ore = Math.floor(minuti / 60);
  return `${ore} h ${String(minuti % 60).padStart(2, '0')} min`;
}
