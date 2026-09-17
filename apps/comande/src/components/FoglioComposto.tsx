import {
  MISURE_CARTA,
  type Biglietto,
  type BloccoBiglietto,
  type Immagine,
  type Ordine,
} from '@sagra-mazzocco/shared';
import { euro } from '../services/formato';
import { CodiceABarre, rigaLeggibile } from './Fogli';

/** Le grandezze sono in punti: la misura della stampa, non dello schermo. */
const PUNTI: Record<string, string> = {
  piccolo: '10pt',
  normale: '12pt',
  grande: '16pt',
  enorme: '24pt',
  gigante: '34pt',
};

function stileTesto(blocco: BloccoBiglietto): React.CSSProperties {
  return {
    fontSize: PUNTI[blocco.grandezza ?? 'normale'],
    fontWeight: blocco.grassetto ? 800 : undefined,
    textAlign:
      blocco.allineamento === 'centro' ? 'center' : blocco.allineamento === 'destra' ? 'right' : 'left',
  };
}

function Blocco({
  blocco,
  ordine,
  immagini,
}: {
  blocco: BloccoBiglietto;
  ordine: Ordine;
  immagini: Map<string, Immagine>;
}) {
  switch (blocco.tipo) {
    case 'titolo':
      return (
        <p className="blocco blocco-titolo" style={stileTesto(blocco)}>
          {blocco.testo}
        </p>
      );

    case 'testo':
      return (
        <p className="blocco blocco-testo" style={stileTesto(blocco)}>
          {blocco.testo}
        </p>
      );

    case 'codice':
      return (
        <p className="blocco blocco-codice" style={stileTesto(blocco)}>
          {ordine.codice ?? `n. ${ordine.numero}`}
        </p>
      );

    case 'tavolo':
      return (
        <p className="blocco blocco-tavolo" style={stileTesto(blocco)}>
          <span className="etichetta">Tavolo</span> {ordine.tavolo ?? '—'}
          {blocco.mostraCoperti && <span className="coperti"> · {ordine.coperti ?? '—'} coperti</span>}
        </p>
      );

    case 'voci':
      return (
        <table className="blocco voci-foglio" style={{ fontSize: PUNTI[blocco.grandezza ?? 'normale'] }}>
          <tbody>
            {ordine.items.map((item) => (
              <tr key={item.prodottoId}>
                <td className="quantita">{item.quantita}×</td>
                <td>{item.nome}</td>
                {blocco.mostraPrezzi && <td className="destra">{euro(item.prezzo * item.quantita)}</td>}
                {blocco.caselleSpunta && <td className="casella-spunta" aria-hidden="true" />}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case 'totale':
      return (
        <p className="blocco blocco-totale" style={stileTesto(blocco)}>
          Totale <strong>{euro(ordine.totale)}</strong>
        </p>
      );

    case 'codiceBarre':
      // Un ordine ancora senza codice (una bozza dal QR) non ha niente da
      // stampare qui: si lascia il posto vuoto invece di un codice finto.
      if (!ordine.codiceBarre) return null;
      return (
        <div className="blocco piede-codice" style={{ textAlign: 'center' }}>
          <CodiceABarre valore={ordine.codiceBarre} />
          {blocco.mostraRigaLeggibile && <p>{rigaLeggibile(ordine)}</p>}
        </div>
      );

    case 'immagine': {
      const immagine = blocco.immagineId ? immagini.get(blocco.immagineId) : undefined;
      if (!immagine) return null;
      return (
        <div className="blocco blocco-immagine" style={{ textAlign: stileTesto(blocco).textAlign }}>
          <img src={immagine.dati} alt={immagine.nome} style={{ width: `${blocco.larghezzaMm ?? 40}mm` }} />
        </div>
      );
    }

    case 'riga':
      return <hr className="blocco blocco-riga" />;

    case 'spazio':
      return <div className="blocco" style={{ height: `${blocco.altezzaMm ?? 5}mm` }} />;
  }
}

/** I blocchi affiancati vicini tra loro formano una sezione a due colonne;
 * quelli a tutta larghezza restano una riga a sé. */
type Sezione = { tipo: 'intera'; blocco: BloccoBiglietto } | { tipo: 'colonne'; sinistra: BloccoBiglietto[]; destra: BloccoBiglietto[] };

function dividiInSezioni(blocchi: BloccoBiglietto[]): Sezione[] {
  const sezioni: Sezione[] = [];
  for (const blocco of blocchi) {
    if (blocco.colonna === 'intera') {
      sezioni.push({ tipo: 'intera', blocco });
      continue;
    }
    const ultima = sezioni[sezioni.length - 1];
    const sezione = ultima?.tipo === 'colonne' ? ultima : { tipo: 'colonne' as const, sinistra: [], destra: [] };
    if (ultima?.tipo !== 'colonne') sezioni.push(sezione);
    if (blocco.colonna === 'sinistra') sezione.sinistra.push(blocco);
    else sezione.destra.push(blocco);
  }
  return sezioni;
}

/** Il foglio disegnato come l'ha composto l'amministratore. Lo usano sia la
 * stampa vera sia l'anteprima nella schermata "Biglietti". */
export function FoglioComposto({
  biglietto,
  ordine,
  immagini,
}: {
  biglietto: Biglietto;
  ordine: Ordine;
  immagini: Map<string, Immagine>;
}) {
  const misure = MISURE_CARTA[biglietto.formato];
  const attivi = biglietto.blocchi.filter((b) => b.attivo);

  return (
    <section
      className="foglio foglio-composto"
      style={{
        width: `${misure.larghezzaMm}mm`,
        minHeight: `${misure.altezzaMm}mm`,
        padding: `${biglietto.margineMm}mm`,
      }}
    >
      {dividiInSezioni(attivi).map((sezione, indice) =>
        sezione.tipo === 'intera' ? (
          <Blocco key={indice} blocco={sezione.blocco} ordine={ordine} immagini={immagini} />
        ) : (
          <div key={indice} className="due-colonne">
            <div className="colonna">
              {sezione.sinistra.map((blocco) => (
                <Blocco key={blocco.id} blocco={blocco} ordine={ordine} immagini={immagini} />
              ))}
            </div>
            <div className="colonna">
              {sezione.destra.map((blocco) => (
                <Blocco key={blocco.id} blocco={blocco} ordine={ordine} immagini={immagini} />
              ))}
            </div>
          </div>
        )
      )}
    </section>
  );
}
