/** Trasforma un nome in un identificativo leggibile: "Grigliata mista" diventa
 * "grigliata-mista". */
export function idDaNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/** Aggiunge un numero in coda finché l'id non è libero: due voci possono
 * chiamarsi uguale, i loro identificativi no. */
export function idLibero(nome: string, presi: Set<string>): string {
  const base = idDaNome(nome);
  if (!base) throw new Error('Nome non valido.');
  if (!presi.has(base)) return base;
  for (let n = 2; ; n++) {
    const tentativo = `${base}-${n}`;
    if (!presi.has(tentativo)) return tentativo;
  }
}
