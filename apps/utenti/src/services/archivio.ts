import {
  dataArchiviata,
  NOME_PAGAMENTO,
  NOME_TIPO_GIORNATA,
  oreDi,
  pagamentoDi,
  type ArchivioEdizione,
  type DocumentoArchiviato,
  type Giornata,
  type Ordine,
  type OrdineBanco,
  type Presenza,
} from '@sagra-mazzocco/shared';

/** Il file che si scarica: uno .zip con dentro i dati completi (per poterli
 * ricaricare) e un Excel da aprire e leggere. Le due librerie si caricano solo
 * qui, quando servono: sono pesanti e il resto dell'app non le usa. */
export async function creaFileArchivio(archivio: ArchivioEdizione): Promise<Blob> {
  const [{ default: JSZip }, excel] = await Promise.all([import('jszip'), creaExcel(archivio)]);
  const zip = new JSZip();
  zip.file('dati-completi.json', JSON.stringify(archivio));
  zip.file(`sagra-mazzocco-${archivio.anno}.xlsx`, excel);
  zip.file(
    'LEGGIMI.txt',
    [
      `Archivio della Sagra di Mazzocco, edizione ${archivio.anno}.`,
      `Creato il ${new Date(archivio.creatoAt).toLocaleString('it-IT')}.`,
      '',
      `sagra-mazzocco-${archivio.anno}.xlsx: da aprire con Excel, un foglio per argomento.`,
      'dati-completi.json: tutti i dati, per ricaricare l’edizione nell’app (app Utenti, scheda Archivio).',
      'Non modificare dati-completi.json a mano.',
    ].join('\r\n')
  );
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Legge un archivio scelto dal computer: lo .zip scaricato, oppure il solo
 * dati-completi.json estratto a mano. */
export async function leggiFileArchivio(file: File): Promise<ArchivioEdizione> {
  let testo: string;
  if (file.name.toLowerCase().endsWith('.json')) {
    testo = await file.text();
  } else {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(file);
    const dati = zip.file('dati-completi.json');
    if (!dati) throw new Error('Nel file non c’è dati-completi.json: non sembra un archivio della sagra.');
    testo = await dati.async('string');
  }
  const archivio = JSON.parse(testo) as ArchivioEdizione;
  if (archivio?.app !== 'sagra-mazzocco' || !Array.isArray(archivio.movimenti)) {
    throw new Error('Questo file non è un archivio della Sagra di Mazzocco.');
  }
  return archivio;
}

export function scarica(blob: Blob, nomeFile: string) {
  const indirizzo = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = indirizzo;
  link.download = nomeFile;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(indirizzo), 10_000);
}

// ---------------------------------------------------------------------------
// L'Excel
// ---------------------------------------------------------------------------

const arrotonda = (n: number) => Math.round(n * 100) / 100;

/** Il valore come lo si vuole vedere in una cella: le date come date, gli
 * elenchi come testo leggibile. */
function cella(valore: unknown): string | number | boolean | Date | null {
  if (valore === null || valore === undefined) return null;
  const data = dataArchiviata(valore);
  if (data) return data;
  if (typeof valore === 'string' || typeof valore === 'number' || typeof valore === 'boolean') return valore;
  return JSON.stringify(valore);
}

function documentiIn(documenti: DocumentoArchiviato[], regola: RegExp): DocumentoArchiviato[] {
  return documenti.filter((d) => regola.test(d.percorso));
}

/** L'id della serata (la data) dal percorso: "serate/2026-10-11/ordini/x". */
function serataDi(percorso: string): string {
  return percorso.split('/')[1] ?? '';
}

async function creaExcel(archivio: ArchivioEdizione): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Sagra di Mazzocco';
  libro.created = new Date(archivio.creatoAt);

  type Colonna = { titolo: string; larghezza?: number; formato?: string };
  function foglio(nome: string, colonne: Colonna[], righe: unknown[][]) {
    const f = libro.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    f.columns = colonne.map((c) => ({ header: c.titolo, width: c.larghezza ?? 16, style: c.formato ? { numFmt: c.formato } : {} }));
    f.getRow(1).font = { bold: true };
    for (const riga of righe) f.addRow(riga.map(cella));
    if (righe.length > 0) f.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colonne.length } };
  }
  /** Un foglio con una colonna per ogni campo che compare: per le raccolte
   * dove non serve un ordine pensato, così non si perde niente. */
  function foglioGenerico(nome: string, documenti: DocumentoArchiviato[]) {
    const campi = [...new Set(documenti.flatMap((d) => Object.keys(d.dati)))].sort();
    foglio(
      nome,
      [{ titolo: 'percorso', larghezza: 34 }, ...campi.map((c) => ({ titolo: c }))],
      documenti.map((d) => [d.percorso, ...campi.map((c) => d.dati[c])])
    );
  }

  const EURO = '#,##0.00 "€"';
  const DATA_ORA = 'dd/mm/yyyy hh:mm';
  const { movimenti, riferimento } = archivio;
  const ordini = documentiIn(movimenti, /^serate\/[^/]+\/ordini\/[^/]+$/).map((d) => d.dati as unknown as Ordine & { percorso: string });
  const banco = documentiIn(movimenti, /^serate\/[^/]+\/ordiniBanco\/[^/]+$/).map((d) => d.dati as unknown as OrdineBanco);
  const serateIds = [
    ...new Set(
      documentiIn(movimenti, /^serate\/[^/]+(\/|$)/)
        .map((d) => serataDi(d.percorso))
        .filter(Boolean)
    ),
  ].sort();

  // Riepilogo: una riga per serata, con le stesse regole della Contabilità
  // (tavoli pagati = partiti o consegnati; scontrini di banco non annullati).
  const pagati = ordini.filter((o) => o.stato === 'in_evasione' || o.stato === 'completata');
  const validi = banco.filter((o) => o.stato === 'incassato');
  foglio(
    'Serate',
    [
      { titolo: 'Serata', larghezza: 12 },
      { titolo: 'Comande tavoli', larghezza: 15 },
      { titolo: 'Coperti', larghezza: 10 },
      { titolo: 'Incasso tavoli', formato: EURO },
      { titolo: 'Scontrini banchi', larghezza: 16 },
      { titolo: 'Incasso banchi', formato: EURO },
      { titolo: 'Incasso totale', formato: EURO },
      { titolo: 'di cui contanti', formato: EURO },
      { titolo: 'di cui POS', formato: EURO },
    ],
    serateIds.map((id) => {
      const t = pagati.filter((o) => o.serataId === id);
      const b = validi.filter((o) => o.serataId === id);
      const tutti = [...t, ...b];
      const somma = (elenco: { totale: number }[]) => arrotonda(elenco.reduce((s, o) => s + (o.totale || 0), 0));
      return [
        id,
        t.length,
        t.reduce((s, o) => s + (o.coperti ?? 0), 0),
        somma(t),
        b.length,
        somma(b),
        somma(tutti),
        somma(tutti.filter((o) => pagamentoDi(o) === 'contanti')),
        somma(tutti.filter((o) => pagamentoDi(o) === 'elettronico')),
      ];
    })
  );

  // Ordini: una riga per piatto, così in Excel si somma e si filtra come si vuole.
  foglio(
    'Ordini',
    [
      { titolo: 'Serata', larghezza: 12 },
      { titolo: 'Dove', larghezza: 10 },
      { titolo: 'Codice', larghezza: 11 },
      { titolo: 'Stato', larghezza: 14 },
      { titolo: 'Pagamento', larghezza: 11 },
      { titolo: 'Tavolo', larghezza: 8 },
      { titolo: 'Coperti', larghezza: 8 },
      { titolo: 'Voce', larghezza: 28 },
      { titolo: 'Quantità', larghezza: 9 },
      { titolo: 'Prezzo', formato: EURO },
      { titolo: 'Importo', formato: EURO },
      { titolo: 'Ora', formato: DATA_ORA, larghezza: 17 },
    ],
    [
      ...ordini.flatMap((o) =>
        (o.items ?? []).map((voce) => [
          o.serataId,
          o.tipo === 'qr' ? 'Tavolo (QR)' : 'Tavolo',
          o.codice ?? o.numero,
          o.stato,
          NOME_PAGAMENTO[pagamentoDi(o)],
          o.tavolo,
          o.coperti,
          voce.nome,
          voce.quantita,
          voce.prezzo,
          arrotonda(voce.prezzo * voce.quantita),
          o.createdAt,
        ])
      ),
      ...banco.flatMap((o) =>
        (o.items ?? []).map((voce) => [
          o.serataId,
          `Banco ${o.banco}`,
          o.codice,
          o.stato,
          NOME_PAGAMENTO[pagamentoDi(o)],
          null,
          null,
          voce.nome,
          voce.quantita,
          voce.prezzo,
          arrotonda(voce.prezzo * voce.quantita),
          o.createdAt,
        ])
      ),
    ]
  );

  // Presenze: una riga per persona e giornata, con le ore già calcolate.
  const giornate = new Map(
    documentiIn(movimenti, /^edizioni\/[^/]+\/giornate\/[^/]+$/).map((d) => [d.percorso.split('/')[3], d.dati as unknown as Giornata])
  );
  foglio(
    'Presenze',
    [
      { titolo: 'Giornata', larghezza: 12 },
      { titolo: 'Tipo', larghezza: 16 },
      { titolo: 'Persona', larghezza: 26 },
      { titolo: 'Presente', larghezza: 9 },
      { titolo: 'Servizio', larghezza: 9 },
      { titolo: 'Extra', larghezza: 9 },
      { titolo: 'Ore servizio', larghezza: 12 },
      { titolo: 'Ore extra', larghezza: 10 },
      { titolo: 'Ore totali', larghezza: 10 },
    ],
    documentiIn(movimenti, /^edizioni\/[^/]+\/giornate\/[^/]+\/presenze\/[^/]+$/).map((d) => {
      const giornataId = d.percorso.split('/')[3];
      const giornata = giornate.get(giornataId) ?? null;
      const presenza = d.dati as unknown as Presenza;
      const ore = oreDi(presenza, giornata);
      return [
        giornataId,
        giornata ? NOME_TIPO_GIORNATA[giornata.tipo] : '',
        presenza.nome,
        presenza.presente ? 'sì' : 'no',
        presenza.servizio ? 'sì' : 'no',
        presenza.extra ? 'sì' : 'no',
        ore.servizio,
        ore.extra,
        ore.totale,
      ];
    })
  );

  foglioGenerico('Spese', documentiIn(movimenti, /^edizioni\/[^/]+\/uscite\/[^/]+$/));
  foglioGenerico('Entrate extra', documentiIn(movimenti, /^edizioni\/[^/]+\/entrate\/[^/]+$/));
  foglioGenerico('Chiusure cassetti', documentiIn(movimenti, /^serate\/[^/]+\/chiusure\/[^/]+$/));
  foglioGenerico('Menù', documentiIn(riferimento, /^(prodotti|categorie|componenti)\/|^banchi\//));
  foglioGenerico(
    'Persone',
    documentiIn(riferimento, /^utenti\//).map((d) => {
      // La password non sta mai in archivio; il resto sì, tranne i permessi tecnici.
      const { accessi: _accessi, ...dati } = d.dati;
      return { ...d, dati };
    })
  );

  return libro.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
