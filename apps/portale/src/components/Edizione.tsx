import { useState } from 'react';
import {
  edizioneAperta,
  idSerata,
  MASSIMO_SERATE_EDIZIONE,
  nomeEdizioneIniziale,
  type Edizione,
} from '@sagra-mazzocco/shared';
import { useEdizioni } from '../hooks';
import { creaEdizione, messaggioErrore, modificaEdizione } from '../services/callables';
import { Calendario, serataBreve } from './Calendario';

/** "venerdì 3 settembre". */
function serataLunga(data: string): string {
  return new Date(`${data}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** L'edizione in cima al menù delle app. Se non ce n'è nessuna,
 * l'amministratore trova qui il modulo per crearla e gli altri un avviso; se
 * c'è, tutti vedono quale, e l'amministratore può cambiarne le serate. */
export function RiquadroEdizione({ amministratore }: { amministratore: boolean }) {
  const edizioni = useEdizioni();
  const [inModifica, setInModifica] = useState(false);

  if (edizioni === null) return null;
  const edizione = edizioneAperta(edizioni);

  if (!edizione) {
    return amministratore ? (
      <ModuloEdizione />
    ) : (
      <p className="avviso-edizione">
        Non c'è nessuna edizione aperta: finché l'amministratore non la crea, le casse non possono lavorare.
      </p>
    );
  }
  if (inModifica && amministratore) {
    return <ModuloEdizione esistente={edizione} onChiudi={() => setInModifica(false)} />;
  }
  return <SchedaEdizione edizione={edizione} amministratore={amministratore} onModifica={() => setInModifica(true)} />;
}

function SchedaEdizione({
  edizione,
  amministratore,
  onModifica,
}: {
  edizione: Edizione;
  amministratore: boolean;
  onModifica: () => void;
}) {
  const oggi = idSerata();
  const { serate } = edizione;
  const quante = serate.length === 1 ? '1 serata' : `${serate.length} serate`;
  const periodo =
    serate.length === 0
      ? ''
      : serate.length === 1
        ? `${quante}: ${serataLunga(serate[0])}`
        : `${quante}, da ${serataLunga(serate[0])} a ${serataLunga(serate[serate.length - 1])}`;

  let stato: string;
  if (edizione.prova) {
    stato = `Si sta provando: la cassa lavora tutti i giorni del ${edizione.id}, e i numeri non sono quelli veri.`;
  } else if (serate.includes(oggi)) {
    stato = 'Stasera è una serata della sagra: la cassa la apre da sola al primo ordine.';
  } else {
    const prossima = serate.find((data) => data > oggi);
    stato = prossima
      ? `Prossima serata: ${serataLunga(prossima)}.`
      : 'Le serate sono finite: a fine sagra si salva e si azzera dall’Archivio, nell’app Utenti.';
  }

  return (
    <section className={`scheda-edizione${edizione.prova ? ' di-prova' : ''}`}>
      <div>
        <span className="occhiello-edizione">{edizione.prova ? 'Edizione di prova' : 'Edizione in corso'}</span>
        <h2>{edizione.nome}</h2>
        {periodo && <p className="periodo-edizione">{periodo}</p>}
        <p className="stato-edizione">{stato}</p>
      </div>
      {amministratore && (
        <button type="button" onClick={onModifica}>
          ✏ Modifica le serate
        </button>
      )}
    </section>
  );
}

/** Crea l'edizione, o ne cambia nome e serate. Una volta creata, se è di
 * prova resta di prova: i suoi numeri non devono diventare quelli veri. */
function ModuloEdizione({ esistente, onChiudi }: { esistente?: Edizione; onChiudi?: () => void }) {
  const [prova, setProva] = useState(esistente?.prova ?? false);
  const [serate, setSerate] = useState<string[]>(esistente?.serate ?? []);
  // Il nome si propone da solo finché non lo si scrive a mano.
  const [nome, setNome] = useState(esistente?.nome ?? '');
  const [nomeScritto, setNomeScritto] = useState(!!esistente);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const anno = esistente?.id ?? serate[0]?.slice(0, 4) ?? idSerata().slice(0, 4);
  const nomeMostrato = nomeScritto ? nome : nomeEdizioneIniziale(anno, prova);

  const anni = new Set(serate.map((data) => data.slice(0, 4)));
  const problema =
    esistente && serate.some((data) => !data.startsWith(`${esistente.id}-`))
      ? `Le serate di questa edizione devono essere del ${esistente.id}.`
      : anni.size > 1
        ? 'Le serate devono essere tutte dello stesso anno.'
        : serate.length > MASSIMO_SERATE_EDIZIONE
          ? `Al massimo ${MASSIMO_SERATE_EDIZIONE} serate.`
          : !prova && serate.length === 0
            ? 'Spunta sul calendario le serate della sagra.'
            : !nomeMostrato.trim()
              ? 'Scrivi il nome dell’edizione.'
              : null;

  async function invia(e: React.FormEvent) {
    e.preventDefault();
    if (problema) return;
    setErrore(null);
    setInCorso(true);
    try {
      if (esistente) {
        await modificaEdizione({ nome: nomeMostrato.trim(), serate });
        onChiudi?.();
      } else {
        await creaEdizione({ nome: nomeMostrato.trim(), serate, prova });
      }
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form className={`modulo-edizione${prova ? ' di-prova' : ''}`} onSubmit={invia}>
      <div className="intestazione-modulo">
        <h2>{esistente ? 'Modifica l’edizione' : 'Nessuna edizione aperta'}</h2>
        {!esistente && (
          <p className="spiegazione">
            Crea l'edizione per cominciare. Le serate spuntate sono i giorni in cui la cassa lavora: la serata si apre
            da sola al primo ordine.
          </p>
        )}
      </div>

      <div className="campi-edizione">
        <div className="colonna-campi">
          <label>
            Nome
            <input
              type="text"
              value={nomeMostrato}
              maxLength={80}
              onChange={(e) => {
                setNome(e.target.value);
                setNomeScritto(true);
              }}
              disabled={inCorso}
            />
          </label>

          {esistente ? (
            <p className="tipo-fisso">
              {prova
                ? 'Edizione di prova: la cassa lavora tutti i giorni dell’anno, spuntati o no.'
                : 'Edizione vera: la cassa lavora solo nelle serate spuntate.'}
            </p>
          ) : (
            <fieldset className="tipo-edizione" disabled={inCorso}>
              <legend>Tipo</legend>
              <label className={!prova ? 'scelto' : ''}>
                <input type="radio" name="tipo" checked={!prova} onChange={() => setProva(false)} />
                <span>
                  <strong>Vera</strong>
                  La sagra. La cassa lavora solo nelle serate spuntate.
                </span>
              </label>
              <label className={prova ? 'scelto' : ''}>
                <input type="radio" name="tipo" checked={prova} onChange={() => setProva(true)} />
                <span>
                  <strong>Di prova</strong>
                  Per provare il sistema: la cassa lavora tutti i giorni, e in ogni app una fascia a strisce ricorda
                  che non è la sagra vera. Si salva, si azzera e si ricarica come una vera, ma si può azzerare anche
                  senza salvarla.
                </span>
              </label>
            </fieldset>
          )}

          <div className="serate-scelte">
            <span className="etichetta-serate">
              {serate.length === 0
                ? prova
                  ? 'Nessuna serata spuntata: in prova non serve.'
                  : 'Nessuna serata spuntata.'
                : serate.length === 1
                  ? '1 serata:'
                  : `${serate.length} serate:`}
            </span>
            {serate.map((data) => (
              <span key={data} className="serata-scelta">
                {serataBreve(data)}
              </span>
            ))}
          </div>
        </div>

        <div className="colonna-calendario">
          <span className="etichetta-calendario">
            Serate della sagra{prova ? ' (in prova sono facoltative)' : ''}
          </span>
          <Calendario
            scelte={serate}
            onCambia={setSerate}
            meseIniziale={serate[0] ?? idSerata()}
            disabilitato={inCorso}
          />
        </div>
      </div>

      {problema && serate.length > 0 && <p className="errore">{problema}</p>}
      {errore && <p className="errore">{errore}</p>}

      <div className="tasti-edizione">
        <button type="submit" className="bottone-principale" disabled={!!problema || inCorso}>
          {inCorso ? 'Un momento…' : esistente ? 'Salva le modifiche' : '➕ Crea l’edizione'}
        </button>
        {esistente && (
          <button type="button" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </button>
        )}
        {problema && serate.length === 0 && <span className="suggerimento">{problema}</span>}
      </div>
    </form>
  );
}
