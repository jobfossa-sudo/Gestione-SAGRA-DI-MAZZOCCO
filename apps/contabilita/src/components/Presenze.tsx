import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import {
  edizioneDiSerata,
  idGiornata,
  nomeCompleto,
  nomeInElenco,
  NOME_TIPO_GIORNATA,
  pesoPresenza,
  TIPI_GIORNATA,
  type Giornata,
  type Presenza,
  type PresenzaStaff,
  type Serata,
  type TipoGiornata,
  type Utente,
} from '@sagra-mazzocco/shared';
import { useGiornate, useOrdini, useOrdiniBanco, usePresenze, usePresenzeStaff, useUtenti } from '../hooks';
import { incassoDiSerata, rendimentoVolontari } from '../services/conti';
import { db } from '../services/firebase';
import { euro } from '../services/formato';
import { nomeSerata, SceltaSerata } from './SceltaSerata';

/** Una riga dell'appello: una persona dell'elenco, o qualcuno che ha già una
 * presenza segnata ma nel frattempo è stato disattivato o eliminato — la sua
 * presenza c'è, e deve restare visibile. */
interface Persona {
  uid: string;
  nome: string;
  nomeUtente: string | null;
}

/** Chi è in appello: le persone attive, più chi ha già una presenza salvata. */
function personeInAppello(utenti: Utente[], salvate: { uid: string; nome: string }[]): Persona[] {
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

function nomeDaSalvare(utenti: Utente[], persona: Persona): string {
  const utente = utenti.find((u) => u.uid === persona.uid);
  return utente ? nomeCompleto(utente) : persona.nome;
}

type Modo = 'servizio' | 'staff';

/** Chi c'era a lavorare. Due modi, perché sono due lavori diversi:
 *
 * - **Servizio**: la serata della sagra. Una spunta e nient'altro.
 * - **Staff**: le giornate senza sagra (preparazione, allestimento,
 *   smontaggio), dove si scrivono le ore. È il lavoro che altrimenti non
 *   comparirebbe da nessuna parte, perché non sta nell'incasso di nessuna sera. */
export function Presenze({
  serate,
  serataId,
  edizioneId,
  onCambiaSerata,
}: {
  serate: Serata[];
  serataId: string | null;
  edizioneId: string;
  onCambiaSerata: (serataId: string) => void;
}) {
  const [modo, setModo] = useState<Modo>('servizio');
  const utenti = useUtenti();

  return (
    <div className="presenze">
      <div className="scelta-modo" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'servizio'}
          className={modo === 'servizio' ? 'attivo' : ''}
          onClick={() => setModo('servizio')}
        >
          Servizio <small>serate della sagra</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={modo === 'staff'}
          className={modo === 'staff' ? 'attivo' : ''}
          onClick={() => setModo('staff')}
        >
          Staff <small>preparazione, allestimento, smontaggio</small>
        </button>
      </div>

      {modo === 'servizio' ? (
        <>
          <SceltaSerata serate={serate} scelta={serataId} onCambia={onCambiaSerata} />
          {serataId && <PresenzeServizio serataId={serataId} utenti={utenti} />}
        </>
      ) : (
        <PresenzeStaff edizioneId={edizioneId} utenti={utenti} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Servizio
// ---------------------------------------------------------------------------

function PresenzeServizio({ serataId, utenti }: { serataId: string; utenti: Utente[] }) {
  const presenze = usePresenze(serataId);
  const ordini = useOrdini(serataId);
  const ordiniBanco = useOrdiniBanco(serataId);
  const [errore, setErrore] = useState<string | null>(null);
  /** Le spunte appena date, prima che il server risponda.
   *
   * Senza, si tocca la casella e non succede niente per un secondo: la casella
   * è comandata da quello che c'è in archivio, e finché l'archivio non
   * risponde torna com'era. Chi sta spuntando venti volontari di fila la
   * ritocca convinto di aver sbagliato mira, e la rimette a zero. */
  const [locali, setLocali] = useState<Record<string, { presente: boolean; meta: boolean }>>({});

  const persone = personeInAppello(utenti, [...presenze.values()]);

  /** Quello che si vede: l'archivio, coperto dalle spunte appena date. */
  function statoDi(uid: string): { presente: boolean; meta: boolean } {
    const salvata = presenze.get(uid);
    return locali[`${serataId}/${uid}`] ?? { presente: salvata?.presente ?? false, meta: salvata?.meta ?? false };
  }

  const incasso = incassoDiSerata(ordini, ordiniBanco);
  const viste = persone.map((persona) => ({
    uid: persona.uid,
    serataId,
    nome: persona.nome,
    ...statoDi(persona.uid),
    aggiornatoAt: { seconds: 0, nanoseconds: 0 },
  }));
  const resa = rendimentoVolontari(incasso.totale, incasso.coperti, viste);

  function presenzaDa(persona: Persona, campi: Partial<Presenza>): Presenza {
    const attuale = statoDi(persona.uid);
    return {
      uid: persona.uid,
      serataId,
      nome: nomeDaSalvare(utenti, persona),
      presente: attuale.presente,
      meta: attuale.meta,
      ...campi,
      aggiornatoAt: serverTimestamp() as unknown as Presenza['aggiornatoAt'],
    };
  }

  async function segna(persona: Persona, campi: Partial<Presenza>) {
    const presenza = presenzaDa(persona, campi);
    setLocali((prec) => ({ ...prec, [`${serataId}/${persona.uid}`]: { presente: presenza.presente, meta: presenza.meta } }));
    try {
      await setDoc(doc(db, `serate/${serataId}/presenze`, persona.uid), presenza);
      setErrore(null);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  async function tuttiPresenti() {
    const batch = writeBatch(db);
    const nuovi: typeof locali = {};
    for (const persona of persone) {
      if (statoDi(persona.uid).presente) continue;
      const presenza = presenzaDa(persona, { presente: true });
      batch.set(doc(db, `serate/${serataId}/presenze`, persona.uid), presenza);
      nuovi[`${serataId}/${persona.uid}`] = { presente: true, meta: presenza.meta };
    }
    setLocali((prec) => ({ ...prec, ...nuovi }));
    try {
      await batch.commit();
      setErrore(null);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  return (
    <>
      <div className="riga-quadrati">
        <section className="quadrato quadrato-conteggio">
          <h3>Volontari presenti</h3>
          <p className="valore-quadrato">{resa.presenti}</p>
          <p className="spiegazione">{resa.peso} serate piene, contando le mezze</p>
        </section>
        <section className="quadrato quadrato-incasso">
          <h3>Resa per volontario</h3>
          <p className="valore-quadrato">{resa.peso === 0 ? '—' : euro(resa.incassoPerVolontario)}</p>
          <p className="spiegazione">Incasso della serata diviso le presenze</p>
        </section>
        <section className="quadrato quadrato-conteggio">
          <h3>Coperti per volontario</h3>
          <p className="valore-quadrato">{resa.peso === 0 ? '—' : String(resa.copertiPerVolontario)}</p>
          <p className="spiegazione">Persone servite a testa</p>
        </section>
      </div>

      <section className="riquadro">
        <h2>Presenze di servizio · {nomeSerata(serataId)}</h2>
        <p className="spiegazione">
          Si spunta a fine serata, in due minuti. <strong>Mezza serata</strong> per chi è arrivato tardi o è andato
          via presto: pesa la metà nel conto qui sopra.
        </p>

        {errore && <p className="errore">{errore}</p>}

        {persone.length === 0 ? (
          <p className="vuoto">Nessuna persona in elenco. Si aggiungono nell'app Utenti.</p>
        ) : (
          <>
            <div className="tasti-appello">
              <button type="button" onClick={tuttiPresenti}>
                Tutti presenti
              </button>
            </div>
            <table className="tabella-conti tabella-presenze">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="centro">C'era</th>
                  <th className="centro">Mezza serata</th>
                </tr>
              </thead>
              <tbody>
                {persone.map((persona) => {
                  const presenza = statoDi(persona.uid);
                  return (
                    <tr key={persona.uid} className={presenza.presente ? 'presente' : undefined}>
                      <td>
                        {persona.nome}
                        {persona.nomeUtente && <small> · {persona.nomeUtente}</small>}
                      </td>
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={presenza.presente}
                          aria-label={`Presente: ${persona.nome}`}
                          onChange={(e) => segna(persona, { presente: e.target.checked })}
                        />
                      </td>
                      <td className="centro">
                        <input
                          type="checkbox"
                          checked={presenza.meta}
                          disabled={!presenza.presente}
                          aria-label={`Mezza serata: ${persona.nome}`}
                          onChange={(e) => segna(persona, { meta: e.target.checked })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totale</td>
                  <td className="centro">
                    <strong>{resa.presenti}</strong>
                  </td>
                  <td className="centro">
                    <strong>{viste.filter((p) => p.presente && p.meta).length}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
        <p className="spiegazione">
          Una presenza intera pesa {pesoPresenza({ presente: true, meta: false })}, una mezza{' '}
          {pesoPresenza({ presente: true, meta: true })}.
        </p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

function oggiLocale(): string {
  const adesso = new Date();
  const mm = String(adesso.getMonth() + 1).padStart(2, '0');
  const gg = String(adesso.getDate()).padStart(2, '0');
  return `${adesso.getFullYear()}-${mm}-${gg}`;
}

export function nomeGiornata(giornata: Pick<Giornata, 'data' | 'tipo'>): string {
  return `${nomeSerata(giornata.data)} — ${NOME_TIPO_GIORNATA[giornata.tipo]}`;
}

/** Le ore si scrivono con la virgola, come si dice a voce: "4,5". */
function leggiOre(testo: string): number | null {
  const pulito = testo.trim().replace(',', '.');
  if (pulito === '') return 0;
  const ore = Number(pulito);
  if (!Number.isFinite(ore) || ore < 0 || ore > 24) return null;
  return Math.round(ore * 100) / 100;
}

function scriviOre(ore: number): string {
  return ore ? String(ore).replace('.', ',') : '';
}

function PresenzeStaff({ edizioneId, utenti }: { edizioneId: string; utenti: Utente[] }) {
  const giornate = useGiornate(edizioneId);
  const [scelta, setScelta] = useState<string | null>(null);
  const giornata = giornate.find((g) => g.id === scelta) ?? giornate[0] ?? null;

  const [nuovaData, setNuovaData] = useState(oggiLocale);
  const [nuovoTipo, setNuovoTipo] = useState<TipoGiornata>('allestimento');
  const [errore, setErrore] = useState<string | null>(null);

  async function creaGiornata(e: React.FormEvent) {
    e.preventDefault();
    if (!nuovaData) return;
    const id = idGiornata(nuovaData, nuovoTipo);
    const edizione = edizioneDiSerata(nuovaData);
    try {
      // Se esiste già la si sceglie e basta: setDoc con merge non tocca le ore.
      await setDoc(
        doc(db, `edizioni/${edizione}/giornate`, id),
        { id, data: nuovaData, tipo: nuovoTipo, createdAt: serverTimestamp() },
        { merge: true }
      );
      setErrore(
        edizione === edizioneId
          ? null
          : `La giornata è del ${edizione}: la trovi scegliendo una serata di quell'anno.`
      );
      setScelta(id);
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  return (
    <>
      <section className="riquadro">
        <h2>Giornate staff</h2>
        <p className="spiegazione">
          Le giornate di lavoro senza sagra. Per ciascuna si segna chi c'era e quante ore ha lavorato: sono le ore in
          più, oltre alle serate.
        </p>
        <form className="nuova-giornata" onSubmit={creaGiornata}>
          <label>
            Data
            <input type="date" value={nuovaData} onChange={(e) => setNuovaData(e.target.value)} required />
          </label>
          <label>
            Tipo
            <select value={nuovoTipo} onChange={(e) => setNuovoTipo(e.target.value as TipoGiornata)}>
              {TIPI_GIORNATA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {NOME_TIPO_GIORNATA[tipo]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="bottone-principale">
            + Nuova giornata
          </button>
        </form>
        {errore && <p className="errore">{errore}</p>}

        {giornate.length > 0 && (
          <label className="scelta-giornata">
            Giornata
            <select value={giornata?.id ?? ''} onChange={(e) => setScelta(e.target.value)}>
              {giornate.map((g) => (
                <option key={g.id} value={g.id}>
                  {nomeGiornata(g)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {giornata ? (
        <AppelloStaff key={giornata.id} edizioneId={edizioneId} giornata={giornata} utenti={utenti} />
      ) : (
        <p className="vuoto">Nessuna giornata staff per il {edizioneId}: creane una qui sopra.</p>
      )}
    </>
  );
}

function AppelloStaff({ edizioneId, giornata, utenti }: { edizioneId: string; giornata: Giornata; utenti: Utente[] }) {
  const presenze = usePresenzeStaff(edizioneId, [giornata.id]).get(giornata.id) ?? [];
  const [locali, setLocali] = useState<Record<string, { presente: boolean; ore: number }>>({});
  const [oreATutti, setOreATutti] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const percorso = `edizioni/${edizioneId}/giornate/${giornata.id}/presenze`;

  const persone = personeInAppello(utenti, presenze);

  function statoDi(uid: string): { presente: boolean; ore: number } {
    const salvata = presenze.find((p) => p.uid === uid);
    return locali[uid] ?? { presente: salvata?.presente ?? false, ore: salvata?.ore ?? 0 };
  }

  function presenzaDa(persona: Persona, campi: { presente?: boolean; ore?: number }): PresenzaStaff {
    const attuale = statoDi(persona.uid);
    const presente = campi.presente ?? attuale.presente;
    return {
      uid: persona.uid,
      giornataId: giornata.id,
      nome: nomeDaSalvare(utenti, persona),
      presente,
      // Chi non c'era non ha ore; chi ha delle ore c'era.
      ore: presente ? (campi.ore ?? attuale.ore) : 0,
      aggiornatoAt: serverTimestamp() as unknown as PresenzaStaff['aggiornatoAt'],
    };
  }

  async function salva(modifiche: { persona: Persona; campi: { presente?: boolean; ore?: number } }[]) {
    const batch = writeBatch(db);
    const nuovi: typeof locali = {};
    for (const { persona, campi } of modifiche) {
      const presenza = presenzaDa(persona, campi);
      batch.set(doc(db, percorso, persona.uid), presenza);
      nuovi[persona.uid] = { presente: presenza.presente, ore: presenza.ore };
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
    const ore = leggiOre(testo);
    if (ore === null) {
      setErrore(`Ore non valide per ${persona.nome}: scrivi un numero da 0 a 24, per esempio 4 o 4,5.`);
      return;
    }
    if (ore === statoDi(persona.uid).ore) return;
    void salva([{ persona, campi: ore > 0 ? { presente: true, ore } : { ore } }]);
  }

  function applicaATutti(e: React.FormEvent) {
    e.preventDefault();
    const ore = leggiOre(oreATutti);
    if (ore === null || ore === 0) {
      setErrore('Scrivi quante ore dare a tutti i presenti, per esempio 4 o 4,5.');
      return;
    }
    const presenti = persone.filter((p) => statoDi(p.uid).presente);
    if (presenti.length === 0) {
      setErrore('Prima spunta chi c\'era (o usa "Tutti presenti"), poi dai le ore.');
      return;
    }
    void salva(presenti.map((persona) => ({ persona, campi: { ore } })));
  }

  async function eliminaGiornata() {
    const conferma = window.confirm(
      `Eliminare la giornata ${nomeGiornata(giornata)} e tutte le sue presenze? Non si può tornare indietro.`
    );
    if (!conferma) return;
    const batch = writeBatch(db);
    for (const presenza of presenze) batch.delete(doc(db, percorso, presenza.uid));
    batch.delete(doc(db, `edizioni/${edizioneId}/giornate`, giornata.id));
    try {
      await batch.commit();
    } catch (err) {
      setErrore((err as Error).message);
    }
  }

  const stati = persone.map((p) => statoDi(p.uid));
  const presenti = stati.filter((s) => s.presente).length;
  const oreTotali = Math.round(stati.reduce((somma, s) => somma + (s.presente ? s.ore : 0), 0) * 100) / 100;

  return (
    <>
      <div className="riga-quadrati">
        <section className="quadrato quadrato-conteggio">
          <h3>Presenti</h3>
          <p className="valore-quadrato">{presenti}</p>
          <p className="spiegazione">{NOME_TIPO_GIORNATA[giornata.tipo]}</p>
        </section>
        <section className="quadrato quadrato-conteggio">
          <h3>Ore lavorate</h3>
          <p className="valore-quadrato">{scriviOre(oreTotali) || '0'}</p>
          <p className="spiegazione">Somma delle ore di tutti</p>
        </section>
      </div>

      <section className="riquadro">
        <h2>Presenze staff · {nomeGiornata(giornata)}</h2>
        {errore && <p className="errore">{errore}</p>}

        {persone.length === 0 ? (
          <p className="vuoto">Nessuna persona in elenco. Si aggiungono nell'app Utenti.</p>
        ) : (
          <>
            <form className="tasti-appello" onSubmit={applicaATutti}>
              <button
                type="button"
                onClick={() =>
                  salva(persone.filter((p) => !statoDi(p.uid).presente).map((persona) => ({ persona, campi: { presente: true } })))
                }
              >
                Tutti presenti
              </button>
              <label>
                Ore a tutti i presenti
                <input
                  type="text"
                  inputMode="decimal"
                  value={oreATutti}
                  onChange={(e) => setOreATutti(e.target.value)}
                  placeholder="4"
                  aria-label="Ore a tutti i presenti"
                />
              </label>
              <button type="submit">Applica</button>
            </form>

            <table className="tabella-conti tabella-presenze">
              <thead>
                <tr>
                  <th>Persona</th>
                  <th className="centro">C'era</th>
                  <th className="centro">Ore</th>
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
                      <td className="centro">
                        {/* La chiave cambia con il valore salvato: quando arriva un numero
                            nuovo (da "Applica" o da un altro computer) la casella si rifà. */}
                        <input
                          key={`${persona.uid}-${stato.ore}`}
                          className="casella-ore"
                          type="text"
                          inputMode="decimal"
                          defaultValue={scriviOre(stato.ore)}
                          aria-label={`Ore: ${persona.nome}`}
                          onBlur={(e) => cambiaOre(persona, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
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
                  <td className="centro">
                    <strong>{scriviOre(oreTotali) || '0'}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </>
        )}

        <div className="tasti-appello">
          <button type="button" className="bottone-elimina" onClick={eliminaGiornata}>
            Elimina questa giornata
          </button>
        </div>
      </section>
    </>
  );
}
