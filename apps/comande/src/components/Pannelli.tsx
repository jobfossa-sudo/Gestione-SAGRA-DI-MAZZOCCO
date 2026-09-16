import { NOME_SETTORE, SETTORI, type Componente, type Prodotto, type Settore, type SottoOrdine } from '@sagra-mazzocco/shared';
import { useComponenti, useProdotti, useSottoOrdiniDaEvadere } from '../hooks';

/** I reparti che compaiono sullo schermo: il bar serve le bevande al momento e
 * non ha bisogno dell'elenco. */
const SETTORI_A_SCHERMO = SETTORI.filter((s) => s !== 'bar');

/** Cosa preparare per una comanda. Le comande create prima delle composizioni
 * non hanno l'elenco dei componenti: per loro valgono i piatti così come sono. */
function partiDaPreparare(sottoOrdine: SottoOrdine): { id: string; nome: string; quantita: number }[] {
  return sottoOrdine.componenti?.length
    ? sottoOrdine.componenti
    : sottoOrdine.items.map((i) => ({ id: i.prodottoId, nome: i.nome, quantita: i.quantita }));
}

interface Voce {
  id: string;
  nome: string;
  quantita: number;
}

/** L'elenco completo di un settore: tutto ciò che quel settore può dover
 * preparare, anche se in questo momento non serve (quantità 0), così le righe
 * restano sempre al loro posto sullo schermo. Sono i componenti del settore più
 * i piatti senza composizione, che il settore prepara così come sono.
 *
 * Si somma il valore esatto delle comande in coda e si arrotonda per eccesso
 * solo alla fine: due piatti di pollo e tre grigliate da mezzo pollo fanno 3,5
 * polli, cioè 4 da mettere sulla griglia. */
function vociDelSettore(
  settore: Settore,
  componenti: Componente[],
  prodotti: Prodotto[],
  sottoOrdini: SottoOrdine[]
): Voce[] {
  const voci = new Map<string, { nome: string; quantita: number }>();
  for (const c of componenti) {
    if (c.settore === settore) voci.set(c.id, { nome: c.nome, quantita: 0 });
  }
  for (const p of prodotti) {
    if (p.settore === settore && !p.composizione?.length) voci.set(p.id, { nome: p.nome, quantita: 0 });
  }
  for (const comanda of sottoOrdini) {
    if (comanda.settore !== settore || comanda.stato !== 'in_preparazione') continue;
    for (const parte of partiDaPreparare(comanda)) {
      // Una voce tolta dal menù nel frattempo compare comunque finché è in coda.
      const voce = voci.get(parte.id) ?? { nome: parte.nome, quantita: 0 };
      voce.quantita += parte.quantita;
      voci.set(parte.id, voce);
    }
  }
  return [...voci.entries()]
    .map(([id, v]) => ({ id, nome: v.nome, quantita: Math.ceil(v.quantita - 1e-9) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
}

/** Un unico schermo per tutta la preparazione: sotto ogni reparto quanto c'è
 * da preparare di ciascuna voce. I numeri scendono da soli quando le comande
 * vengono evase (con la lettura del codice a barre). */
export function Pannelli() {
  const sottoOrdini = useSottoOrdiniDaEvadere();
  const componenti = useComponenti();
  const prodotti = useProdotti();

  return (
    <div className="area riquadro pannello-unico">
      <h2>Da preparare</h2>
      {SETTORI_A_SCHERMO.map((settore) => {
        const voci = vociDelSettore(settore, componenti, prodotti, sottoOrdini);
        return (
          <section key={settore} className={`elenco-settore settore-${settore}`}>
            <h3 className="testata-settore">{NOME_SETTORE[settore]}</h3>
            {voci.length === 0 ? (
              <p className="vuoto">Nessuna voce per questo reparto.</p>
            ) : (
              <ul className="voci-settore">
                {voci.map((voce) => (
                  <li key={voce.id} className={voce.quantita === 0 ? 'a-zero' : undefined}>
                    <span className="nome-voce">{voce.nome}</span>
                    <span className="quantita-voce">{voce.quantita}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
