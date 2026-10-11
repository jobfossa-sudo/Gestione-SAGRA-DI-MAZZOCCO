import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  edizioneDiSerata,
  nomeCompleto,
  nomeInElenco,
  NOME_TIPO_GIORNATA,
  ORARIO_SERVIZIO_INIZIALE,
  oreDi,
  oreServizio,
  TIPI_GIORNATA,
  type Giornata,
  type Presenza,
  type Serata,
  type TipoGiornata,
  type Utente,
} from '@sagra-mazzocco/shared';
import {
  useGiornata,
  useGiornate,
  useOrdini,
  useOrdiniBanco,
  usePresenze,
  usePresenzeGiornate,
  useUtenti,
} from '../hooks';
import { arrotonda, incassoDiSerata, rendimentoVolontari, riepilogoPersone } from '../services/conti';
import { db } from '../services/firebase';
import { euro } from '../services/formato';
import { nomeSerata } from './SceltaSerata';
import { dataBreve, ore, TabellaGiornate, TabellaTotale } from './TabellePresenze';

/** Una riga dell'appello: una persona dell'elenco, o qualcuno che ha già una
 * presenza segnata ma nel frattempo è stato disattivato o eliminato — la sua
 * presenza c'è, e deve restare visibile. */
interface Persona {
  uid: string;
  nome: string;
  nomeUtente: string | null;
}

function personeInAppello(utenti: Utente[], salvate: Presenza[]): Persona[] {
  const persone: Persona[] = utenti
    .filter((utente) => utente.attivo || salvate.some((p) => p.uid === utente.uid))
    .map((utente) => ({ uid: utente.uid, nome: nomeInElenco(utente), nomeUtente: utente.nomeUtente }));
  for (const presenza of salvate) {
    if (!persone.some((p) => p.uid === presenza.uid)) {
      persone.push({ uid: presenza.uid, nome: presenza.nome, nomeUtente: null });
    }
  }
  return persone;
}

/** Le ore si scrivono con la virgola, come si dice a voce: "4,5". */
function leggiOre(testo: string): number | null {
  const pulito = testo.trim().replace(',', '.');
  if (pulito === '') return 0;
  const valore = Number(pulito);
  if (!Number.isFinite(valore) || valore < 0 || valore > 24) return null;
  return Math.round(valore * 100) / 100;
}

function spostaGiorno(data: string, giorni: number): string {
  const giorno = new Date(`${data}T12:00:00`);
  giorno.setDate(giorno.getDate() + giorni);
  return giorno.toISOString().slice(0, 10);
}

type Stato = Pick<Presenza, 'presente' | 'servizio' | 'extra' | 'oreExtra'>;
const ASSENTE: Stato = { presente: false, servizio: false, extra: false, oreExtra: 0 };

/** Le presenze, giornata per giornata.
 *
 * Si sceglie la data dal calendario e si dice che giornata è: una serata di
 * sagra, o una giornata di preparazione, allestimento o smontaggio. Per ogni
 * persona tre spunte:
 * - **Presente**: c'era.
 * - **Servizio**: ha fatto la serata. Solo nelle serate di sagra; le ore sono
 *   quelle dell'orario scritto in alto, uguale per tutti.
 * - **Extra**: ha lavorato in più, e accanto si scrivono le ore. */
export function Presenze({ serate, dataIniziale }: { serate: Serata[]; dataIniziale: string }) {
  const [data, setData] = useState(dataIniziale);
  const edizioneId = edizioneDiSerata(data);
  const utenti = useUtenti();

  return (
    <div className="presenze">
      <Giornaliero data={data} onCambiaData={setData} serate={serate} utenti={utenti} />
      <Stampe edizioneId={edizioneId} utenti={utenti} onApri={setData} dataAperta={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// La giornata scelta
// ---------------------------------------------------------------------------

function Giornaliero({
  data,
  onCambiaData,
  serate,
  utenti,
}: {
  data: string;
  onCambiaData: (data: string) => void;
  serate: Serata[];
  utenti: Utente[];
}) {
  const edizioneId = edizioneDiSerata(data);
  const { giornata: salvata, caricata } = useGiornata(data);
  const presenze = usePresenze(data);
  const ordini = useOrdini(data);
  const ordiniBanco = useOrdiniBanco(data);
  const [errore, setErrore] = useState<string | null>(null);
  const [oreATutti, setOreATutti] = useState('');
  /** Le spunte appena date, prima che il server risponda: senza, la casella
   * torna com'era per un secondo e chi spunta venti persone di fila la ritocca
   * convinto di aver sbagliato mira. */
  const [locali, setLocali] = useState<Record<string, Stato>>({});
  useEffect(() => setLocali({}), [data]);

  // Una data mai usata non ha ancora la sua giornata: la si propone (serata di
  // sagra se Comande ha una serata quel giorno) e la si scrive al primo tocco.
  const giornata: Giornata = salvata ?? {
    id: data,
    data,
    tipo: serate.some((s) => s.id === data) ? 'sagra' : 'preparazione',
    ...ORARIO_SERVIZIO_INIZIALE,
    createdAt: { seconds: 0, nanoseconds: 0 },
  };
  const sagra = giornata.tipo === 'sagra';
  const percorsoGiornata = `edizioni/${edizioneId}/giornate`;
  const percorso = `${percorsoGiornata}/${data}/presenze`;

  const salvate = [...presenze.values()];
  const persone = personeInAppello(utenti, salvate);

  function statoDi(uid: string): Stato {
    const salvataPersona = presenze.get(uid);
    return locali[uid] ?? (salvataPersona ? { ...ASSENTE, ...salvataPersona } : ASSENTE);
  }

  function giornataDaScrivere(campi: Partial<Giornata> = {}) {
    return {
      id: data,
      data,
      tipo: giornata.tipo,
      oraInizio: giornata.oraInizio,
      oraFine: giornata.oraFine,
      ...(salvata ? {} : { createdAt: serverTimestamp() }),
      ...campi,
    };
  }

  async function salvaGiornata(campi: Partial<Giornata>) {
    try {
      await setDoc(doc(db, percorsoGiornata, data), giornataDaScrivere(campi), { merge: true });
      setErrore(null);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  /** Le spunte si tengono coerenti: chi non c'era non ha né servizio né extra,
   * chi ha servizio o extra c'era. */
  function regola(attuale: Stato, campi: Partial<Stato>): Stato {
    const nuovo = { ...attuale, ...campi };
    if (campi.presente === false) return { ...ASSENTE };
    if (nuovo.servizio || nuovo.extra) nuovo.presente = true;
    if (!sagra) nuovo.servizio = false;
    if (!nuovo.extra) nuovo.oreExtra = 0;
    return nuovo;
  }

  async function salva(modifiche: { persona: Persona; campi: Partial<Stato> }[]) {
    if (modifiche.length === 0) return;
    const batch = writeBatch(db);
    // La giornata nasce con la prima presenza, se non c'era ancora.
    if (!salvata) batch.set(doc(db, percorsoGiornata, data), giornataDaScrivere(), { merge: true });
    const nuovi: Record<string, Stato> = {};
    for (const { persona, campi } of modifiche) {
      const stato = regola(statoDi(persona.uid), campi);
      const utente = utenti.find((u) => u.uid === persona.uid);
      const presenza: Presenza = {
        uid: persona.uid,
        giornataId: data,
        nome: utente ? nomeCompleto(utente) : persona.nome,
        ...stato,
        aggiornatoAt: serverTimestamp() as unknown as Presenza['aggiornatoAt'],
      };
      batch.set(doc(db, percorso, persona.uid), presenza);
      nuovi[persona.uid] = stato;
    }
    setLocali((prec) => ({ ...prec, ...nuovi }));
    try {
      await batch.commit();
      setErrore(null);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  function cambiaOre(persona: Persona, testo: string) {
    const valore = leggiOre(testo);
    if (valore === null) {
      setErrore(`Ore non valide per ${persona.nome}: scrivi un numero da 0 a 24, per esempio 4 o 4,5.`);
      return;
    }
    if (valore === statoDi(persona.uid).oreExtra) return;
    void salva([{ persona, campi: valore > 0 ? { extra: true, oreExtra: valore } : { oreExtra: 0 } }]);
  }

  function applicaOreATutti(e: React.FormEvent) {
    e.preventDefault();
    const valore = leggiOre(oreATutti);
    if (valore === null || valore === 0) {
      setErrore('Scrivi quante ore extra dare a tutti i presenti, per esempio 4 o 4,5.');
      return;
    }
    const presenti = persone.filter((p) => statoDi(p.uid).presente);
    if (presenti.length === 0) {
      setErrore('Prima spunta chi c\'era (o usa "Tutti presenti"), poi dai le ore.');
      return;
    }
    void salva(presenti.map((persona) => ({ persona, campi: { extra: true, oreExtra: valore } })));
  }

  async function eliminaGiornata() {
    const conferma = window.confirm(
      `Eliminare la giornata di ${nomeSerata(data)} e tutte le sue presenze? Non si può tornare indietro.`
    );
    if (!conferma) return;
    const batch = writeBatch(db);
    for (const presenza of salvate) batch.delete(doc(db, percorso, presenza.uid));
    batch.delete(doc(db, percorsoGiornata, data));
    try {
      await batch.commit();
      setLocali({});
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  const stati = persone.map((p) => statoDi(p.uid));
  const presenti = stati.filter((s) => s.presente).length;
  const inServizio = stati.filter((s) => s.presente && s.servizio).length;
  const oreSera = oreServizio(giornata);
  const oreExtra = arrotonda(stati.reduce((somma, s) => somma + oreDi(s, giornata).extra, 0));
  const incasso = incassoDiSerata(ordini, ordiniBanco);
  const resa = rendimentoVolontari(
    incasso.totale,
    incasso.coperti,
    persone.map((p, i) => ({ uid: p.uid, giornataId: data, nome: p.nome, ...stati[i], aggiornatoAt: { seconds: 0, nanoseconds: 0 } })),
    giornata
  );

  return (
    <>
      <section className="riquadro">
        <h2>Giornata</h2>
        <div className="scelta-giornata">
          <div className="calendario">
            <button type="button" onClick={() => onCambiaData(spostaGiorno(data, -1))} aria-label="Giorno prima">
              ◀
            </button>
            <label>
              Data
              <input type="date" value={data} onChange={(e) => e.target.value && onCambiaData(e.target.value)} />
            </label>
            <button type="button" onClick={() => onCambiaData(spostaGiorno(data, 1))} aria-label="Giorno dopo">
              ▶
            </button>
          </div>
          <label>
            Tipo di giornata
            <select
              value={giornata.tipo}
              disabled={!caricata}
              onChange={(e) => salvaGiornata({ tipo: e.target.value as TipoGiornata })}
            >
              {TIPI_GIORNATA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {NOME_TIPO_GIORNATA[tipo]}
                </option>
              ))}
            </select>
          </label>
          {sagra && (
            <div className="orario-servizio">
              <label>
                Servizio dalle
                <input
                  type="time"
                  value={giornata.oraInizio}
                  onChange={(e) => e.target.value && salvaGiornata({ oraInizio: e.target.value })}
                />
              </label>
              <label>
                alle
                <input
                  type="time"
                  value={giornata.oraFine}
                  onChange={(e) => e.target.value && salvaGiornata({ oraFine: e.target.value })}
                />
              </label>
              <span className="durata-servizio">
                = <strong>{ore(oreSera)}</strong> ore a testa, uguali per tutti
              </span>
            </div>
          )}
        </div>
        <p className="spiegazione">
          {nomeSerata(data)}
          {!salvata && caricata && ' · giornata nuova: si salva alla prima spunta'}
        </p>
      </section>

      <div className="riga-quadrati">
        <section className="quadrato quadrato-conteggio">
          <h3>Presenti</h3>
          <p className="valore-quadrato">{presenti}</p>
          <p className="spiegazione">{NOME_TIPO_GIORNATA[giornata.tipo]}</p>
        </section>
        {sagra && (
          <section className="quadrato quadrato-conteggio">
            <h3>In servizio</h3>
            <p className="valore-quadrato">{inServizio}</p>
            <p className="spiegazione">{ore(arrotonda(inServizio * oreSera))} ore di servizio in tutto</p>
          </section>
        )}
        <section className="quadrato quadrato-conteggio">
          <h3>Ore extra</h3>
          <p className="valore-quadrato">{ore(oreExtra) === '—' ? '0' : ore(oreExtra)}</p>
          <p className="spiegazione">Somma delle ore extra di tutti</p>
        </section>
        {sagra && (
          <section className="quadrato quadrato-incasso">
            <h3>Resa per volontario</h3>
            <p className="valore-quadrato">{resa.inServizio === 0 ? '—' : euro(resa.incassoPerVolontario)}</p>
            <p className="spiegazione">
              {resa.inServizio === 0
                ? 'Incasso della serata diviso chi era in servizio'
                : `${euro(resa.incassoPerOra)} per ora di servizio`}
            </p>
          </section>
        )}
      </div>

      <section className="riquadro">
        <h2>Chi c'era</h2>
        {errore && <p className="errore">{errore}</p>}

        {persone.length === 0 ? (
          <p className="vuoto">Nessuna persona in elenco. Si aggiungono nell'app Utenti.</p>
        ) : (
          <>
            <form className="tasti-appello" onSubmit={applicaOreATutti}>
              <button
                type="button"
                onClick={() =>
                  salva(persone.filter((p) => !statoDi(p.uid).presente).map((persona) => ({ persona, campi: { presente: true } })))
                }
              >
                Tutti presenti
              </button>
              {sagra && (
                <button
                  type="button"
                  onClick={() =>
                    salva(
                      persone
                        .filter((p) => statoDi(p.uid).presente && !statoDi(p.uid).servizio)
                        .map((persona) => ({ persona, campi: { servizio: true } }))
                    )
                  }
                >
                  Servizio a tutti i presenti
                </button>
              )}
              <label>
                Ore extra a tutti i presenti
                <input
                  type="text"
                  inputMode="decimal"
                  value={oreATutti}
                  onChange={(e) => setOreATutti(e.target.value)}
                  placeholder="4"
                  aria-label="Ore extra a tutti i presenti"
                />
              </label>
              <button type="submit">Applica</button>
            </form>

            <table className="tabella-conti tabella-presenze">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="centro">Presente</th>
                  {sagra && <th className="centro">Servizio serata</th>}
                  <th className="centro">Presenza extra</th>
                  <th className="centro">Ore extra</th>
                  <th className="destra">Ore totali</th>
                </tr>
              </thead>
              <tbody>
                {persone.map((persona, i) => {
                  const stato = stati[i];
                  return (
                    <tr key={persona.uid} className={stato.presente ? 'presente' : undefined}>
                      <td>
                        {persona.nome}
                        {persona.nomeUtente && <small> · {persona.nomeUtente}</small>}
                      </td>
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={stato.presente}
                          aria-label={`Presente: ${persona.nome}`}
                          onChange={(e) => salva([{ persona, campi: { presente: e.target.checked } }])}
                        />
                      </td>
                      {sagra && (
                        <td className="centro">
                          <input
                            type="checkbox"
                            checked={stato.servizio}
                            aria-label={`Servizio serata: ${persona.nome}`}
                            onChange={(e) => salva([{ persona, campi: { servizio: e.target.checked } }])}
                          />
                        </td>
                      )}
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={stato.extra}
                          aria-label={`Presenza extra: ${persona.nome}`}
                          onChange={(e) => salva([{ persona, campi: { extra: e.target.checked } }])}
                        />
                      </td>
                      <td className="centro">
                        {/* La chiave cambia con il valore salvato: quando arriva un numero
                            nuovo (da "Applica" o da un altro computer) la casella si rifà. */}
                        <input
                          key={`${data}-${persona.uid}-${stato.oreExtra}`}
                          className="casella-ore"
                          type="text"
                          inputMode="decimal"
                          defaultValue={stato.oreExtra ? String(stato.oreExtra).replace('.', ',') : ''}
                          aria-label={`Ore extra: ${persona.nome}`}
                          onBlur={(e) => cambiaOre(persona, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </td>
                      <td className="destra">
                        <strong>{ore(oreDi(stato, giornata).totale)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td className="centro">
                    <strong>{presenti}</strong>
                  </td>
                  {sagra && (
                    <td className="centro">
                      <strong>{inServizio}</strong>
                    </td>
                  )}
                  <td className="centro">
                    <strong>{stati.filter((s) => s.presente && s.extra).length}</strong>
                  </td>
                  <td className="centro">
                    <strong>{ore(oreExtra)}</strong>
                  </td>
                  <td className="destra">
                    <strong>{ore(arrotonda(inServizio * oreSera + oreExtra))}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        {salvata && (
          <div className="tasti-appello">
            <button type="button" className="bottone-elimina" onClick={eliminaGiornata}>
              Elimina questa giornata
            </button>
          </div>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Le stampe dell'edizione
// ---------------------------------------------------------------------------

type Stampa = 'giornate' | 'totale';

function Stampe({
  edizioneId,
  utenti,
  onApri,
  dataAperta,
}: {
  edizioneId: string;
  utenti: Utente[];
  onApri: (data: string) => void;
  dataAperta: string;
}) {
  const giornate = useGiornate(edizioneId);
  const presenze = usePresenzeGiornate(
    edizioneId,
    useMemo(() => giornate.map((g) => g.id), [giornate])
  );
  const righe = riepilogoPersone(new Map(utenti.map((u) => [u.uid, nomeInElenco(u)])), giornate, presenze);
  const [stampa, setStampa] = useState<Stampa | null>(null);

  // Si disegna il foglio, poi si stampa: chiamare print() prima che il foglio
  // ci sia stamperebbe una pagina vuota.
  useEffect(() => {
    if (!stampa) return;
    document.body.classList.add('stampa-presenze');
    const fine = () => {
      document.body.classList.remove('stampa-presenze');
      setStampa(null);
    };
    window.addEventListener('afterprint', fine, { once: true });
    const attesa = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(attesa);
      window.removeEventListener('afterprint', fine);
      document.body.classList.remove('stampa-presenze');
    };
  }, [stampa]);

  return (
    <section className="riquadro">
      <h2>Giornate dell'edizione {edizioneId}</h2>
      {giornate.length === 0 ? (
        <p className="vuoto">Nessuna giornata segnata nel {edizioneId}.</p>
      ) : (
        <>
          <div className="elenco-giornate">
            {giornate.map((g) => (
              <button
                key={g.id}
                type="button"
                className={g.id === dataAperta ? 'attiva' : ''}
                onClick={() => onApri(g.data)}
              >
                {dataBreve(g.data)} <small>{NOME_TIPO_GIORNATA[g.tipo]}</small>
              </button>
            ))}
          </div>
          <div className="tasti-appello">
            <button type="button" className="bottone-principale" onClick={() => setStampa('giornate')}>
              🖨 Stampa le giornate
            </button>
            <button type="button" className="bottone-principale" onClick={() => setStampa('totale')}>
              🖨 Stampa il totale
            </button>
          </div>
        </>
      )}

      {stampa &&
        createPortal(
          <div className="foglio-stampa">
            {/* La tabella unica ha una colonna per giornata: in orizzontale ci sta. */}
            {stampa === 'giornate' && <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>}
            {stampa === 'totale' && <style>{'@page { size: A4 portrait; margin: 12mm; }'}</style>}
            <h1>Sagra di Mazzocco {edizioneId} · Presenze</h1>
            <p>
              {stampa === 'giornate'
                ? 'Ore di ciascuno, giornata per giornata (servizio + extra).'
                : 'Totale dell\'edizione per persona.'}{' '}
              {giornate.length} giornate, {righe.length} persone.
            </p>
            {stampa === 'giornate' ? (
              <TabellaGiornate righe={righe} giornate={giornate} presenze={presenze} />
            ) : (
              <TabellaTotale righe={righe} />
            )}
          </div>,
          document.body
        )}
    </section>
  );
}
