/** Il numero di tavolo arriva dall'indirizzo: è quello scritto nel QR
 * attaccato al tavolo (…/?tavolo=7). Fuori da quel caso la pagina è quella
 * del personale, con l'accesso. Null se il numero manca o non ha senso. */
export function tavoloDaIndirizzo(): number | null {
  const valore = new URLSearchParams(window.location.search).get('tavolo');
  if (valore === null) return null;
  const numero = Number(valore);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

/** L'indirizzo da mettere nel QR di un tavolo: la pagina da cui si sta usando
 * l'app, con il numero del tavolo. */
export function indirizzoTavolo(tavolo: number): string {
  return `${window.location.origin}${window.location.pathname}?tavolo=${tavolo}`;
}
