import {
  NOME_BANCO,
  pagamentoDi,
  pesoPresenza,
  type ChiusuraCassa,
  type EntrataExtra,
  type Ordine,
  type OrdineBanco,
  type Presenza,
  type Uscita,
} from '@sagra-mazzocco/shared';

/** Tutti i conti della contabilità stanno qui, lontano dalle schermate.
 *
 * Il motivo è uno solo: questi numeri finiscono in un rendiconto, e un numero
 * che si calcola dentro un componente è un numero che nessuno può controllare.
 * Qui si leggono, si discutono e si provano uno per uno. */

/** Un ordine dei tavoli fa incasso quando è stato pagato: è partito verso i
 * reparti o è già stato consegnato. Le bozze mai passate in cassa no, gli
 * annullati nemmeno. È la stessa regola che usa Fine serata in Comande. */
export function ordiniPagati(ordini: Ordine[]): Ordine[] {
  return ordini.filter((o) => o.stato === 'in_evasione' || o.stato === 'completata');
}

/** Uno scontrino di banco fa incasso finché non viene annullato. */
export function scontriniValidi(ordiniBanco: OrdineBanco[]): OrdineBanco[] {
  return ordiniBanco.filter((o) => o.stato === 'incassato');
}

/** Un punto in cui si incassa e che a fine serata va contato: una cassa dei
 * tavoli (una per lettera) o un banco. L'id è quello del documento di
 * chiusura. */
export interface Punto {
  id: string;
  nome: string;
  contanti: number;
  elettronico: number;
  totale: number;
  quanti: number;
}

/** I punti cassa di una serata, ricavati da chi ha davvero incassato. Non da
 * un elenco fisso: le lettere delle casse le assegna l'amministratore, e una
 * cassa che stasera non ha aperto non deve chiedere di essere contata. */
export function puntiDiSerata(ordini: Ordine[], ordiniBanco: OrdineBanco[]): Punto[] {
  const punti = new Map<string, Punto>();

  const aggiungi = (id: string, nome: string, totale: number, metodo: 'contanti' | 'elettronico') => {
    const punto = punti.get(id) ?? { id, nome, contanti: 0, elettronico: 0, totale: 0, quanti: 0 };
    punto[metodo] += totale;
    punto.totale += totale;
    punto.quanti += 1;
    punti.set(id, punto);
  };

  for (const ordine of ordiniPagati(ordini)) {
    const lettera = ordine.cassa ?? '?';
    aggiungi(`cassa-${lettera}`, `Cassa ${lettera}`, ordine.totale, pagamentoDi(ordine));
  }
  for (const scontrino of scontriniValidi(ordiniBanco)) {
    aggiungi(`banco-${scontrino.banco}`, `Banco ${NOME_BANCO[scontrino.banco]}`, scontrino.totale, pagamentoDi(scontrino));
  }

  return [...punti.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

export interface IncassoSerata {
  punti: Punto[];
  contanti: number;
  elettronico: number;
  totale: number;
  /** Quante comande hanno davvero fatto incasso. */
  ordini: number;
  coperti: number;
  /** Incasso diviso per il numero di comande: lo scontrino medio. */
  medio: number;
}

export function incassoDiSerata(ordini: Ordine[], ordiniBanco: OrdineBanco[]): IncassoSerata {
  const punti = puntiDiSerata(ordini, ordiniBanco);
  const contanti = punti.reduce((somma, p) => somma + p.contanti, 0);
  const elettronico = punti.reduce((somma, p) => somma + p.elettronico, 0);
  const quanti = punti.reduce((somma, p) => somma + p.quanti, 0);
  const coperti = ordiniPagati(ordini).reduce((somma, o) => somma + (o.coperti ?? 0), 0);
  const totale = contanti + elettronico;
  return { punti, contanti, elettronico, totale, ordini: quanti, coperti, medio: quanti > 0 ? totale / quanti : 0 };
}

/** Quanto manca (o avanza) in un cassetto rispetto a quello che dice l'app.
 *
 * Il fondo cassa non è incasso: si mette nel cassetto prima di cominciare e a
 * fine serata si ritrova lì dentro, quindi si toglie dal contato prima di
 * confrontare. Positivo = c'è più di quanto dovrebbe. */
export interface Scarto {
  contanti: number;
  elettronico: number;
  /** Vero quando il conteggio non è ancora stato fatto: non è uno scarto di
   * zero, è un dato che manca. */
  daContare: boolean;
}

export function scartoDiCassa(punto: Punto, chiusura: ChiusuraCassa | undefined): Scarto {
  if (!chiusura) return { contanti: 0, elettronico: 0, daContare: true };
  return {
    contanti: arrotonda(chiusura.contatoContanti - chiusura.fondoCassa - punto.contanti),
    elettronico: arrotonda(chiusura.contatoElettronico - punto.elettronico),
    daContare: false,
  };
}

/** Gli euro si arrotondano al centesimo: sommando numeri col virgola mobile
 * salta fuori lo 0,30000000000000004, e in un rendiconto fa una brutta figura. */
export function arrotonda(valore: number): number {
  return Math.round(valore * 100) / 100;
}

/** Le spese che contano davvero: un preventivo non ancora pagato non è un
 * costo, è un'intenzione. */
export function usciteReali(uscite: Uscita[]): Uscita[] {
  return uscite.filter((u) => u.pagata);
}

export function entrateReali(entrate: EntrataExtra[]): EntrataExtra[] {
  return entrate.filter((e) => e.incassata);
}

/** Il conto economico: quanto è entrato, quanto è uscito, cosa resta.
 *
 * Le spese di una serata precisa si attribuiscono a lei; quelle dell'evento
 * (la tensostruttura) restano dell'evento e si vedono solo nel totale. Non le
 * spalmo sulle serate: dividere per il numero di sere darebbe un utile per
 * serata che sembra preciso e non lo è. */
export interface ContoEconomico {
  incassoCasse: number;
  entrateExtra: number;
  entrate: number;
  usciteDiSerata: number;
  usciteDellEvento: number;
  uscite: number;
  utile: number;
}

export function contoEconomico(
  incassoCasse: number,
  entrate: EntrataExtra[],
  uscite: Uscita[],
  serataId: string | null
): ContoEconomico {
  const extra = entrateReali(entrate)
    .filter((e) => (serataId ? e.serataId === serataId : true))
    .reduce((somma, e) => somma + e.importo, 0);

  const pagate = usciteReali(uscite);
  const diSerata = pagate
    .filter((u) => (serataId ? u.serataId === serataId : u.serataId !== null))
    .reduce((somma, u) => somma + u.importo, 0);
  const dellEvento = serataId ? 0 : pagate.filter((u) => u.serataId === null).reduce((somma, u) => somma + u.importo, 0);

  const entrateTotali = arrotonda(incassoCasse + extra);
  const usciteTotali = arrotonda(diSerata + dellEvento);
  return {
    incassoCasse: arrotonda(incassoCasse),
    entrateExtra: arrotonda(extra),
    entrate: entrateTotali,
    usciteDiSerata: arrotonda(diSerata),
    usciteDellEvento: arrotonda(dellEvento),
    uscite: usciteTotali,
    utile: arrotonda(entrateTotali - usciteTotali),
  };
}

/** Quanto ha reso la serata per ogni volontario presente.
 *
 * Mezza serata pesa mezzo, così chi arriva alle dieci non conta come chi c'è
 * da mezzogiorno. È un indicatore grezzo e va detto: non misura quanto lavora
 * una persona, misura quante persone servono per fare quell'incasso. */
export interface RendimentoVolontari {
  presenti: number;
  /** Presenze pesate: due mezze serate fanno una persona. */
  peso: number;
  incassoPerVolontario: number;
  copertiPerVolontario: number;
}

export function rendimentoVolontari(
  incasso: number,
  coperti: number,
  presenze: Presenza[]
): RendimentoVolontari {
  const presenti = presenze.filter((p) => p.presente).length;
  const peso = presenze.reduce((somma, p) => somma + pesoPresenza(p), 0);
  return {
    presenti,
    peso,
    incassoPerVolontario: peso > 0 ? arrotonda(incasso / peso) : 0,
    copertiPerVolontario: peso > 0 ? Math.round(coperti / peso) : 0,
  };
}

/** I piatti più venduti della serata, dal più venduto. Guarda sia i tavoli sia
 * i banchi: per chi tiene i conti una birra venduta al banco e una venduta al
 * tavolo sono due birre. */
export interface RigaVenduto {
  nome: string;
  quantita: number;
  incasso: number;
}

export function vendutoDiSerata(ordini: Ordine[], ordiniBanco: OrdineBanco[]): RigaVenduto[] {
  const righe = new Map<string, RigaVenduto>();

  const aggiungi = (nome: string, quantita: number, incasso: number) => {
    const riga = righe.get(nome) ?? { nome, quantita: 0, incasso: 0 };
    riga.quantita += quantita;
    riga.incasso = arrotonda(riga.incasso + incasso);
    righe.set(nome, riga);
  };

  for (const ordine of ordiniPagati(ordini)) {
    for (const voce of ordine.items) aggiungi(voce.nome, voce.quantita, voce.prezzo * voce.quantita);
  }
  for (const scontrino of scontriniValidi(ordiniBanco)) {
    for (const voce of scontrino.items) aggiungi(voce.nome, voce.quantita, voce.prezzo * voce.quantita);
  }

  return [...righe.values()].sort((a, b) => b.quantita - a.quantita);
}
