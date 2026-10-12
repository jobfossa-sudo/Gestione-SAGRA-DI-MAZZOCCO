import { useEffect, useState } from 'react';
import { riepilogoDiMovimenti, type ArchivioEdizione, type RiepilogoEdizione } from '@sagra-mazzocco/shared';
import { creaFileArchivio, leggiFileArchivio, puoScegliereDove, salvaFile } from '../services/archivio';
import { ConfermaIdentita } from './ConfermaIdentita';
import { azzeraEdizione, esportaEdizione, messaggioErrore, ricaricaEdizione, riepilogoEdizioni } from '../services/callables';

/** "9 serate · 1.240 ordini dei tavoli · …": quanto c'è, a colpo d'occhio. */
function Conteggi({ r }: { r: RiepilogoEdizione }) {
  const voci: [number, string, string][] = [
    [r.serate, 'serata', 'serate'],
    [r.ordini, 'ordine dei tavoli', 'ordini dei tavoli'],
    [r.ordiniBanco, 'scontrino dei banchi', 'scontrini dei banchi'],
    [r.uscite, 'spesa', 'spese'],
    [r.entrate, 'entrata extra', 'entrate extra'],
    [r.giornate, 'giornata di presenze', 'giornate di presenze'],
  ];
  return (
    <p className="conteggi">
      {voci.map(([n, uno, tanti]) => (
        <span key={tanti}>
          <strong>{n.toLocaleString('it-IT')}</strong> {n === 1 ? uno : tanti}
        </span>
      ))}
    </p>
  );
}

function adesso(): string {
  const d = new Date();
  const due = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${due(d.getMonth() + 1)}${due(d.getDate())}-${due(d.getHours())}${due(d.getMinutes())}`;
}

/** Salvare, azzerare e ricaricare un'edizione della sagra.
 *
 * I tre passi sono separati e in quest'ordine apposta: l'azzeramento si
 * accende solo dopo aver salvato il file in questa stessa schermata (e il
 * server lo ricontrolla), e chiede di scrivere a mano la frase di conferma.
 * Tutti e tre chiedono prima la password dell'amministratore. */
export function Archivio() {
  const [edizioni, setEdizioni] = useState<RiepilogoEdizione[] | null>(null);
  const [anno, setAnno] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  /** Gli anni scaricati da questa schermata: solo questi si possono azzerare. */
  const [scaricati, setScaricati] = useState<Record<string, string>>({});
  const [conferma, setConferma] = useState('');
  const [daRicaricare, setDaRicaricare] = useState<ArchivioEdizione | null>(null);
  /** L'operazione che aspetta la password, con la frase che la descrive. */
  const [richiesta, setRichiesta] = useState<{ azione: string; poi: () => void } | null>(null);
  /** L'archivio preparato e non ancora salvato: si salva con un clic a parte,
   * perché il browser apre la finestra "Salva con nome" solo in risposta a un
   * clic, e preparare l'archivio può richiedere più di qualche secondo. */
  const [pronto, setPronto] = useState<{ anno: string; nome: string; file: Blob; documenti: number } | null>(null);

  async function aggiorna() {
    try {
      const { data } = await riepilogoEdizioni();
      setEdizioni(data.edizioni);
      setAnno((prec) => (prec && data.edizioni.some((e) => e.anno === prec) ? prec : (data.edizioni[0]?.anno ?? null)));
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }
  useEffect(() => {
    void aggiorna();
  }, []);

  async function esegui(etichetta: string, operazione: () => Promise<string>) {
    setErrore(null);
    setEsito(null);
    setInCorso(etichetta);
    try {
      setEsito(await operazione());
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(null);
    }
  }

  const scelta = edizioni?.find((e) => e.anno === anno) ?? null;
  const fraseConferma = anno ? `AZZERA ${anno}` : '';

  /** Prima la password, poi l'operazione. */
  function conPassword(azione: string, poi: () => void) {
    setErrore(null);
    setEsito(null);
    setRichiesta({ azione, poi });
  }

  const prepara = () =>
    conPassword(`salvare l'archivio del ${anno}`, () =>
      esegui('Preparo l’archivio…', async () => {
        const { data: archivio } = await esportaEdizione({ anno: anno! });
        const nome = `sagra-mazzocco-${anno}-${adesso()}.zip`;
        setPronto({ anno: anno!, nome, file: await creaFileArchivio(archivio), documenti: archivio.movimenti.length });
        return `Archivio del ${anno} pronto: ${archivio.movimenti.length} documenti. Ora scegli dove salvarlo.`;
      })
    );

  const salvaPronto = () =>
    esegui('Salvo il file…', async () => {
      const daSalvare = pronto!;
      const salvato = await salvaFile(daSalvare.file, daSalvare.nome);
      if (!salvato) return 'Salvataggio annullato: il file non è stato scritto. Premi di nuovo per scegliere dove salvarlo.';
      setPronto(null);
      setScaricati((prec) => ({ ...prec, [daSalvare.anno]: daSalvare.nome }));
      return puoScegliereDove
        ? `Salvato "${daSalvare.nome}". Conservane una seconda copia, per esempio su una chiavetta.`
        : `Scaricato "${daSalvare.nome}" nella cartella Download. Copialo su una chiavetta o in un posto sicuro.`;
    });

  const azzera = () =>
    conPassword(`azzerare l'edizione ${anno}`, () => {
      if (!window.confirm(`Ultima conferma: cancellare tutti i movimenti del ${anno}? Non si torna indietro se non ricaricando il file.`)) {
        return;
      }
      void esegui('Azzero l’edizione…', async () => {
        const { data } = await azzeraEdizione({ anno: anno!, conferma });
        setConferma('');
        setScaricati(({ [anno!]: _tolto, ...resto }) => resto);
        await aggiorna();
        return `Edizione ${data.anno} azzerata: cancellati ${data.documenti} documenti. Persone, menù e biglietti sono rimasti.`;
      });
    });

  async function scegliFile(file: File | undefined) {
    setDaRicaricare(null);
    setErrore(null);
    setEsito(null);
    if (!file) return;
    try {
      setDaRicaricare(await leggiFileArchivio(file));
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  const ricarica = () =>
    conPassword(`ricaricare l'archivio del ${daRicaricare!.anno}`, () =>
      esegui('Ricarico l’archivio…', async () => {
        const { data } = await ricaricaEdizione({ archivio: daRicaricare! });
        setDaRicaricare(null);
        await aggiorna();
        return `Edizione ${data.anno} ricaricata: ${data.documenti} documenti di nuovo nell'app.`;
      })
    );

  return (
    <div className="archivio">
      {richiesta && (
        <ConfermaIdentita
          azione={richiesta.azione}
          onAnnulla={() => setRichiesta(null)}
          onConfermato={() => {
            const poi = richiesta.poi;
            setRichiesta(null);
            poi();
          }}
        />
      )}
      <section className="elenco">
        <h2>Archivio delle edizioni</h2>
        <p className="spiegazione">
          A fine sagra si salva l'edizione in un file e la si azzera, così l'anno dopo si riparte pulito. Restano
          sempre le persone, il menù, i biglietti e i QR.
        </p>

        {edizioni === null ? (
          <p className="vuoto">Carico le edizioni…</p>
        ) : edizioni.length === 0 ? (
          <p className="vuoto">Nessuna edizione con dei dati: non c'è niente da salvare né da azzerare.</p>
        ) : (
          <>
            <label className="scelta-anno">
              Edizione
              <select value={anno ?? ''} onChange={(e) => setAnno(e.target.value)} disabled={!!inCorso}>
                {edizioni.map((e) => (
                  <option key={e.anno} value={e.anno}>
                    {e.anno}
                  </option>
                ))}
              </select>
            </label>
            {scelta && <Conteggi r={scelta} />}
          </>
        )}
      </section>

      {inCorso && <p className="in-corso">{inCorso}</p>}
      {errore && <p className="errore">{errore}</p>}
      {esito && <p className="successo">{esito}</p>}

      {scelta && (
        <>
          <section className="elenco passo">
            <h3>
              <span className="numero-passo">1</span> Salva l'archivio
            </h3>
            <p className="spiegazione">
              Prepara un file .zip con dentro un <strong>Excel</strong> da aprire (un foglio per serate, ordini,
              presenze, spese, entrate, chiusure, menù e persone) e i <strong>dati completi</strong> per poter
              ricaricare l'edizione un giorno.{' '}
              {puoScegliereDove
                ? 'Poi scegli tu dove salvarlo: sul computer o su una chiavetta USB.'
                : 'Questo browser lo mette nella cartella Download: da lì copialo su una chiavetta. (Con Chrome o Edge si sceglie la cartella.)'}
            </p>
            {pronto?.anno === anno ? (
              <div className="pronto">
                <p>
                  ✓ Archivio pronto: <strong>{pronto.nome}</strong> ({pronto.documenti} documenti)
                </p>
                <button type="button" className="bottone-principale" disabled={!!inCorso} onClick={salvaPronto}>
                  {puoScegliereDove ? '💾 Scegli dove salvarlo…' : '⬇ Scarica il file'}
                </button>
              </div>
            ) : (
              <button type="button" className="bottone-principale" disabled={!!inCorso} onClick={prepara}>
                Prepara l'archivio del {anno}
              </button>
            )}
            {scaricati[anno!] && <p className="fatto">✓ Salvato: {scaricati[anno!]}</p>}
          </section>

          <section className={`elenco passo passo-pericoloso ${scaricati[anno!] ? '' : 'spento'}`}>
            <h3>
              <span className="numero-passo">2</span> Azzera l'edizione
            </h3>
            <p className="spiegazione">
              Cancella serate, ordini, incassi, chiusure, spese, entrate e presenze del {anno}.{' '}
              {scaricati[anno!] ? (
                <>
                  Per confermare scrivi <strong>{fraseConferma}</strong>.
                </>
              ) : (
                <strong>Si può fare solo dopo aver salvato l'archivio qui sopra.</strong>
              )}
            </p>
            <div className="riga-azzera">
              <input
                type="text"
                value={conferma}
                onChange={(e) => setConferma(e.target.value)}
                placeholder="scrivi qui la frase"
                disabled={!scaricati[anno!] || !!inCorso}
                aria-label="Frase di conferma"
                autoComplete="off"
              />
              <button
                type="button"
                className="bottone-elimina"
                disabled={!scaricati[anno!] || conferma !== fraseConferma || !!inCorso}
                onClick={azzera}
              >
                Azzera il {anno}
              </button>
            </div>
          </section>
        </>
      )}

      <section className="elenco passo">
        <h3>
          <span className="numero-passo">3</span> Ricarica un archivio
        </h3>
        <p className="spiegazione">
          Rimette nell'app un'edizione salvata, per riguardarla in Contabilità. Si ricarica solo in un'edizione vuota,
          così due anni non si mescolano mai. Menù e persone non si toccano: quelli di allora restano nell'Excel.
        </p>
        <input
          type="file"
          accept=".zip,.json"
          aria-label="File dell'archivio"
          disabled={!!inCorso}
          onChange={(e) => {
            void scegliFile(e.target.files?.[0]);
            // Si svuota, altrimenti scegliere di nuovo lo stesso file non fa niente.
            e.target.value = '';
          }}
        />
        {daRicaricare && (
          <div className="anteprima-archivio">
            <p>
              Archivio dell'edizione <strong>{daRicaricare.anno}</strong>, creato il{' '}
              {new Date(daRicaricare.creatoAt).toLocaleString('it-IT')}:
            </p>
            <Conteggi r={riepilogoDiMovimenti(daRicaricare.anno, daRicaricare.movimenti)} />
            {edizioni?.some((e) => e.anno === daRicaricare.anno) && (
              <p className="errore">
                Nel {daRicaricare.anno} ci sono già dei dati: prima salvali e azzera l'edizione, poi ricarica.
              </p>
            )}
            <button type="button" className="bottone-principale" disabled={!!inCorso} onClick={ricarica}>
              Ricarica nel {daRicaricare.anno}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
