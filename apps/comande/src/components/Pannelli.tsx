import { NOME_SETTORE, SETTORI, type Settore, type SottoOrdine } from '@sagra-mazzocco/shared';
import { useSottoOrdiniDaEvadere, useUtenteAutenticato } from '../hooks';
import { quantitaInTesto } from '../services/quantita';

/** Cosa preparare per una comanda. Le comande create prima delle composizioni
 * non hanno l'elenco dei componenti: per loro valgono i piatti così come sono. */
function partiDaPreparare(sottoOrdine: SottoOrdine): { id: string; nome: string; quantita: number }[] {
  return sottoOrdine.componenti?.length
    ? sottoOrdine.componenti
    : sottoOrdine.items.map((i) => ({ id: i.prodottoId, nome: i.nome, quantita: i.quantita }));
}

interface Totale {
  id: string;
  nome: string;
  esatta: number;
  daFare: number;
}

/** Il totale di ogni componente da preparare in un settore, sommando tutte le
 * comande in coda: chi cuoce ragiona per quantità, non per singolo ordine. Si
 * somma il valore esatto e si arrotonda per eccesso solo alla fine — due piatti
 * di pollo e tre grigliate da mezzo pollo fanno 3,5 polli, cioè 4 da mettere
 * sulla griglia. */
function totaliDelSettore(sottoOrdini: SottoOrdine[], settore: Settore): Totale[] {
  const somma = new Map<string, { nome: string; quantita: number }>();
  for (const comanda of sottoOrdini) {
    if (comanda.settore !== settore || comanda.stato !== 'in_preparazione') continue;
    for (const parte of partiDaPreparare(comanda)) {
      const riga = somma.get(parte.id) ?? { nome: parte.nome, quantita: 0 };
      riga.quantita += parte.quantita;
      somma.set(parte.id, riga);
    }
  }
  return [...somma.entries()]
    .map(([id, r]) => ({ id, nome: r.nome, esatta: Math.round(r.quantita * 1000) / 1000, daFare: Math.ceil(r.quantita - 1e-9) }))
    .sort((a, b) => b.daFare - a.daFare || a.nome.localeCompare(b.nome, 'it'));
}

/** Un'unica pagina con un elenco per settore: sotto ogni reparto, quanto c'è da
 * preparare di ciascuna voce. I numeri scendono da soli quando le comande
 * vengono evase (in futuro con la lettura del codice a barre). */
export function Pannelli() {
  const { permessi } = useUtenteAutenticato();
  const sottoOrdini = useSottoOrdiniDaEvadere();

  const amministratore = permessi.amministratore === true;
  const ruoli = permessi.comande ?? [];
  // L'amministratore vede tutti i settori; gli altri solo i propri.
  const settoriVisibili = SETTORI.filter((s) => amministratore || ruoli.includes(s));

  const elenchi = settoriVisibili.map((settore) => ({ settore, totali: totaliDelSettore(sottoOrdini, settore) }));

  if (settoriVisibili.length === 0) {
    return (
      <div className="area segnaposto">
        <h2>Pannelli di settore</h2>
        <p>Il tuo account non è assegnato a nessun settore di preparazione.</p>
      </div>
    );
  }

  return (
    <div className="area riquadro pannello-unico">
      <h2>Da preparare</h2>
      {elenchi.map(({ settore, totali }) => (
        <section key={settore} className={`elenco-settore settore-${settore}`}>
          <h3 className="testata-settore">{NOME_SETTORE[settore]}</h3>
          {totali.length === 0 ? (
            <p className="vuoto">Niente da preparare.</p>
          ) : (
            <ul className="voci-settore">
              {totali.map((riga) => (
                <li key={riga.id}>
                  <span className="nome-voce">
                    {riga.nome}
                    {riga.esatta !== riga.daFare && <small>servono {quantitaInTesto(riga.esatta)}</small>}
                  </span>
                  <span className="puntini" aria-hidden="true" />
                  <span className="quantita-voce">{riga.daFare}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
