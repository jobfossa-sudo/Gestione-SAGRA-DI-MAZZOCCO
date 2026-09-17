/** Il menù del cliente si apre inquadrando il QR, che porta a `…/?menu`.
 * Non c'è un QR per ogni tavolo: il numero del tavolo lo scrive il cliente
 * dentro il menù. `?tavolo=7` continua a valere per i QR già stampati, e in
 * quel caso il numero arriva già compilato. */
export function menuDaIndirizzo(): { attivo: boolean; tavolo: number | null } {
  const parametri = new URLSearchParams(window.location.search);
  if (!parametri.has('menu') && !parametri.has('tavolo')) return { attivo: false, tavolo: null };
  const valore = parametri.get('tavolo');
  const numero = Number(valore);
  return { attivo: true, tavolo: valore !== null && Number.isInteger(numero) && numero > 0 ? numero : null };
}

/** L'indirizzo da mettere nel QR: la pagina da cui si sta usando l'app. */
export function indirizzoMenu(): string {
  return `${window.location.origin}${window.location.pathname}?menu`;
}
