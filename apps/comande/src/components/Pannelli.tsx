import { useEffect, useMemo, useState } from 'react';
import { NOME_SETTORE, SETTORI, type FirestoreTimestampLike, type Settore, type SottoOrdine } from '@sagra-mazzocco/shared';
import { useSottoOrdiniDaEvadere, useUtenteAutenticato } from '../hooks';
import { messaggioErrore, segnaSottoOrdinePronto } from '../services/callables';
import { quantitaInTesto } from '../services/quantita';
import { SERATA_ID_OGGI } from '../services/serata';

/** Cosa preparare per una comanda. Le comande create prima delle composizioni
 * non hanno l'elenco dei componenti: per loro valgono i piatti così come sono. */
function partiDaPreparare(sottoOrdine: SottoOrdine): { id: string; nome: string; quantita: number }[] {
  return sottoOrdine.componenti?.length
    ? sottoOrdine.componenti
    : sottoOrdine.items.map((i) => ({ id: i.prodottoId, nome: i.nome, quantita: i.quantita }));
}

/** true se la comanda contiene almeno un piatto scomposto: solo allora serve
 * ricordare sotto per quali piatti si stanno preparando quei componenti. */
function haComposizioni(sottoOrdine: SottoOrdine): boolean {
  const piatti = new Set(sottoOrdine.items.map((i) => i.prodottoId));
  return (sottoOrdine.componenti ?? []).some((c) => !piatti.has(c.id));
}

/** Da quanto è arrivata la comanda, in parole. Serve a capire al volo chi
 * aspetta da troppo, senza far conti sull'orologio. */
function daQuanto(createdAt: FirestoreTimestampLike | null, adesso: number): string {
  if (!createdAt) return 'adesso';
  const minuti = Math.floor((adesso - createdAt.seconds * 1000) / 60000);
  if (minuti < 1) return 'adesso';
  if (minuti === 1) return '1 minuto fa';
  return `${minuti} minuti fa`;
}

function ComandaPronta({ sottoOrdine, adesso }: { sottoOrdine: SottoOrdine; adesso: number }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const minuti = sottoOrdine.createdAt ? Math.floor((adesso - sottoOrdine.createdAt.seconds * 1000) / 60000) : 0;

  async function segnaPronta() {
    setErrore(null);
    setInCorso(true);
    try {
      await segnaSottoOrdinePronto({ serataId: SERATA_ID_OGGI, sottoOrdineId: sottoOrdine.id });
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <article className={`comanda${minuti >= 10 ? ' in-ritardo' : ''}`}>
      <header>
        <span className="codice">{sottoOrdine.codice}</span>
        <span className="quando">{daQuanto(sottoOrdine.createdAt, adesso)}</span>
      </header>
      <ul className="voci-comanda">
        {partiDaPreparare(sottoOrdine).map((parte) => (
          <li key={parte.id}>
            <span className="quantita">{quantitaInTesto(parte.quantita)}×</span>
            <span>{parte.nome}</span>
          </li>
        ))}
      </ul>
      {haComposizioni(sottoOrdine) && (
        <p className="per-piatti">per {sottoOrdine.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</p>
      )}
      {errore && <p className="errore">{errore}</p>}
      <button type="button" className="bottone-principale" disabled={inCorso} onClick={segnaPronta}>
        {inCorso ? 'Un momento…' : 'Pronta'}
      </button>
    </article>
  );
}

export function Pannelli() {
  const { permessi } = useUtenteAutenticato();
  const sottoOrdini = useSottoOrdiniDaEvadere();
  const [scelto, setScelto] = useState<Settore | null>(null);

  // L'orologio scandisce i minuti di attesa: senza, i tempi resterebbero
  // fermi finché non arriva una comanda nuova.
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const battito = setInterval(() => setAdesso(Date.now()), 20000);
    return () => clearInterval(battito);
  }, []);

  const amministratore = permessi.amministratore === true;
  const ruoli = permessi.comande ?? [];
  // L'amministratore vede tutti i settori; gli altri solo i propri.
  const settoriVisibili = SETTORI.filter((s) => amministratore || ruoli.includes(s));
  const settore = scelto && settoriVisibili.includes(scelto) ? scelto : settoriVisibili[0];

  const daPreparare = useMemo(
    () => sottoOrdini.filter((s) => s.settore === settore && s.stato === 'in_preparazione'),
    [sottoOrdini, settore]
  );
  const pronte = useMemo(
    () => sottoOrdini.filter((s) => s.settore === settore && s.stato === 'pronta'),
    [sottoOrdini, settore]
  );

  /** Il totale di ogni componente da preparare, sommando tutte le comande in
   * coda: chi cuoce ragiona per quantità, non per singolo ordine. Si somma il
   * valore esatto e si arrotonda per eccesso solo alla fine — due piatti di
   * pollo e tre grigliate da mezzo pollo fanno 3,5 polli, cioè 4 da mettere
   * sulla griglia. */
  const totali = useMemo(() => {
    const somma = new Map<string, { nome: string; quantita: number }>();
    for (const comanda of daPreparare) {
      for (const parte of partiDaPreparare(comanda)) {
        const riga = somma.get(parte.id) ?? { nome: parte.nome, quantita: 0 };
        riga.quantita += parte.quantita;
        somma.set(parte.id, riga);
      }
    }
    return [...somma.values()]
      .map((r) => ({ nome: r.nome, esatta: Math.round(r.quantita * 1000) / 1000, daFare: Math.ceil(r.quantita - 1e-9) }))
      .sort((a, b) => b.daFare - a.daFare || a.nome.localeCompare(b.nome, 'it'));
  }, [daPreparare]);

  if (!settore) {
    return (
      <div className="area segnaposto">
        <h2>Pannelli di settore</h2>
        <p>Il tuo account non è assegnato a nessun settore di preparazione.</p>
      </div>
    );
  }

  return (
    <div className="area pannello">
      {settoriVisibili.length > 1 && (
        <nav className="sotto-schede">
          {settoriVisibili.map((s) => {
            const quante = sottoOrdini.filter((x) => x.settore === s && x.stato === 'in_preparazione').length;
            return (
              <button key={s} type="button" className={s === settore ? 'attiva' : ''} onClick={() => setScelto(s)}>
                {NOME_SETTORE[s]}
                {quante > 0 && <span className="contatore">{quante}</span>}
              </button>
            );
          })}
        </nav>
      )}

      <section className="riquadro totali-settore">
        <h2>
          Da preparare <span className="contatore">{daPreparare.length}</span>
        </h2>
        {totali.length === 0 ? (
          <p className="vuoto">Niente in coda: sei in pari.</p>
        ) : (
          <ul className="totali">
            {totali.map((riga) => (
              <li key={riga.nome}>
                <span className="quantita-grande">{riga.daFare}</span>
                <span className="nome-totale">
                  {riga.nome}
                  {riga.esatta !== riga.daFare && <small>servono {quantitaInTesto(riga.esatta)}</small>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {daPreparare.length > 0 && (
        <div className="comande">
          {daPreparare.map((s) => (
            <ComandaPronta key={s.id} sottoOrdine={s} adesso={adesso} />
          ))}
        </div>
      )}

      {pronte.length > 0 && (
        <section className="riquadro">
          <h2>
            Pronte, in attesa di ritiro <span className="contatore">{pronte.length}</span>
          </h2>
          <ul className="elenco-pronte">
            {pronte.map((s) => (
              <li key={s.id}>
                <span className="codice">{s.codice}</span>
                <span className="voci">{s.items.map((i) => `${i.quantita}× ${i.nome}`).join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
