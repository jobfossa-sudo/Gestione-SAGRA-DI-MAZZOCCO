import { BAGNI, type Bagno } from '@sagra-mazzocco/shared';

/** La pagina delle segnalazioni si apre inquadrando il cartello appeso in
 * bagno, che porta a `…/?bagno=donne`. Il bagno sta nell'indirizzo e non lo
 * sceglie il cliente: sono tre e vicini, e chi ha trovato il guaio non deve
 * mettersi a indovinare come si chiama la porta da cui è appena uscito. */
export function segnalazioneDaIndirizzo(): { attiva: boolean; bagno: Bagno | null } {
  const parametri = new URLSearchParams(window.location.search);
  const valore = parametri.get('bagno');
  if (valore === null) return { attiva: false, bagno: null };
  return { attiva: true, bagno: BAGNI.includes(valore as Bagno) ? (valore as Bagno) : null };
}

