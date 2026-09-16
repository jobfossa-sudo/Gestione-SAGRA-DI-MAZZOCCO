import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NOME_SETTORE,
  PASSO_ORDINE,
  SETTORI,
  type Categoria,
  type DisponibilitaProdotto,
  type Prodotto,
  type Settore,
} from '@sagra-mazzocco/shared';
import { useCategorie, useDisponibilita, useProdotti } from '../hooks';
import { impostaPorzioni, messaggioErrore, segnaEsaurito } from '../services/callables';
import { db } from '../services/firebase';
import { idLibero } from '../services/identificativi';
import { SERATA_ID_OGGI } from '../services/serata';

/** Numero di colonne della tabella: serve alle righe che ne occupano una sola
 * a tutta larghezza (intestazioni di portata, messaggi di errore). */
const COLONNE = 10;

/** Portata fittizia dove finiscono i piatti la cui categoria non esiste (più)
 * — per esempio dopo che è stata cancellata. Restano visibili e si possono
 * trascinare al posto giusto invece di sparire senza spiegazione. */
const SENZA_PORTATA = '__senza_portata__';

/** Il prezzo si scrive e si legge all'italiana: "12,50 €". */
function prezzoInTesto(valore: number): string {
  return `${valore.toFixed(2).replace('.', ',')} €`;
}

/** Accetta "12,50 €", "12.5", "12" e simili. Restituisce null se non è un
 * prezzo valido, così la casella torna al valore di prima. */
function prezzoDaTesto(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(',', '.');
  const numero = Number(pulito);
  if (pulito === '' || Number.isNaN(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
}

// ---------------------------------------------------------------------------
// Riga di un piatto
// ---------------------------------------------------------------------------

interface PropsRiga {
  prodotto: Prodotto;
  disponibilita?: DisponibilitaProdotto;
  trascinamento: Trascinamento;
}

function RigaPiatto({ prodotto, disponibilita, trascinamento }: PropsRiga) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [porzioni, setPorzioni] = useState(
    disponibilita?.porzioniMassime === null || disponibilita === undefined
      ? ''
      : String(disponibilita.porzioniMassime)
  );

  const venduti = disponibilita?.venduti ?? 0;
  const massime = disponibilita?.porzioniMassime ?? null;
  const rimaste = massime === null ? null : Math.max(0, massime - venduti);
  const finito = prodotto.esauritoSerata === SERATA_ID_OGGI;
  const bersaglio = trascinamento.bersaglio?.primaDi === prodotto.id;

  async function esegui(operazione: () => Promise<unknown>) {
    setErrore(null);
    setInCorso(true);
    try {
      await operazione();
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  const salvaCampo = (campi: Partial<Prodotto>) => esegui(() => updateDoc(doc(db, 'prodotti', prodotto.id), campi));

  function salvaPrezzo(e: React.FocusEvent<HTMLInputElement>) {
    const nuovo = prezzoDaTesto(e.target.value);
    if (nuovo === null || nuovo === prodotto.prezzo) {
      e.target.value = prezzoInTesto(prodotto.prezzo);
      return;
    }
    e.target.value = prezzoInTesto(nuovo);
    salvaCampo({ prezzo: nuovo });
  }

  function salvaPorzioni() {
    const valore = porzioni.trim() === '' ? null : Number(porzioni);
    if (valore === massime) return;
    return esegui(() => impostaPorzioni({ serataId: SERATA_ID_OGGI, prodottoId: prodotto.id, porzioniMassime: valore }));
  }

  async function elimina() {
    if (!window.confirm(`Eliminare "${prodotto.nome}" dal menù?`)) return;
    await esegui(() => deleteDoc(doc(db, 'prodotti', prodotto.id)));
  }

  const classi = [
    finito ? 'finito' : '',
    bersaglio ? 'bersaglio' : '',
    trascinamento.prodottoId === prodotto.id ? 'in-volo' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <tr className={classi || undefined} data-categoria={prodotto.categoriaId} data-prodotto={prodotto.id}>
        <td className="maniglia">
          <span
            role="button"
            tabIndex={-1}
            aria-label={`Sposta ${prodotto.nome}`}
            title="Trascina per spostare il piatto"
            onPointerDown={(e) => {
              e.preventDefault();
              trascinamento.inizia(prodotto.id);
            }}
          >
            ⠿
          </span>
        </td>
        <td>
          <select
            value={prodotto.settore ?? 'cucina'}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ settore: e.target.value as Settore })}
            aria-label={`Settore di ${prodotto.nome}`}
          >
            {SETTORI.map((settore) => (
              <option key={settore} value={settore}>
                {NOME_SETTORE[settore]}
              </option>
            ))}
          </select>
        </td>
        <td className="colonna-piatto">
          <input
            type="text"
            defaultValue={prodotto.nome}
            disabled={inCorso}
            title={prodotto.nome}
            onBlur={(e) => e.target.value !== prodotto.nome && salvaCampo({ nome: e.target.value })}
            aria-label={`Nome di ${prodotto.nome}`}
          />
        </td>
        <td className="colonna-note">
          <input
            type="text"
            placeholder="ingredienti, contorno…"
            defaultValue={prodotto.note ?? ''}
            disabled={inCorso}
            onBlur={(e) => e.target.value !== (prodotto.note ?? '') && salvaCampo({ note: e.target.value })}
            aria-label={`Note di ${prodotto.nome}`}
          />
        </td>
        <td>
          <input
            type="text"
            inputMode="decimal"
            className="prezzo"
            placeholder="--,-- €"
            defaultValue={prezzoInTesto(prodotto.prezzo)}
            disabled={inCorso}
            onBlur={salvaPrezzo}
            aria-label={`Prezzo di ${prodotto.nome}`}
          />
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={prodotto.novita}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ novita: e.target.checked })}
            aria-label={`Novità: ${prodotto.nome}`}
          />
        </td>
        <td className="centro">
          <input
            type="number"
            min="0"
            className="porzioni"
            placeholder="∞"
            value={porzioni}
            disabled={inCorso}
            onChange={(e) => setPorzioni(e.target.value)}
            onBlur={salvaPorzioni}
            aria-label={`Porzioni di serata per ${prodotto.nome}`}
          />
        </td>
        <td className="centro conteggio">
          {massime === null ? <span className="illimitato">—</span> : <strong>{rimaste}</strong>}
          <small>{venduti} venduti</small>
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={finito}
            disabled={inCorso}
            onChange={(e) =>
              esegui(() => segnaEsaurito({ serataId: SERATA_ID_OGGI, prodottoId: prodotto.id, esaurito: e.target.checked }))
            }
            aria-label={`Esaurito: ${prodotto.nome}`}
          />
        </td>
        <td>
          <button type="button" className="bottone-annulla" disabled={inCorso} onClick={elimina}>
            Elimina
          </button>
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={COLONNE}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Riga "aggiungi un piatto", in fondo a ogni portata
// ---------------------------------------------------------------------------

function RigaNuovoPiatto({
  categoriaId,
  ordineInFondo,
  idPresi,
  trascinamento,
}: {
  categoriaId: string;
  ordineInFondo: number;
  idPresi: Set<string>;
  trascinamento: Trascinamento;
}) {
  const [settore, setSettore] = useState<Settore>('cucina');
  const [nome, setNome] = useState('');
  const [note, setNote] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [novita, setNovita] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const bersaglio = trascinamento.bersaglio?.categoriaId === categoriaId && trascinamento.bersaglio.primaDi === null;

  async function aggiungi() {
    setErrore(null);
    if (!nome.trim()) {
      setErrore('Scrivi il nome del piatto.');
      return;
    }
    const valore = prezzoDaTesto(prezzo);
    if (valore === null) {
      setErrore('Prezzo non valido: scrivilo come 12,50.');
      return;
    }
    setInCorso(true);
    try {
      const id = idLibero(nome, idPresi);
      const prodotto: Prodotto = {
        id,
        categoriaId,
        settore,
        nome: nome.trim(),
        note: note.trim(),
        prezzo: valore,
        novita,
        esauritoSerata: null,
        ordine: ordineInFondo,
      };
      await setDoc(doc(db, 'prodotti', id), prodotto);
      setNome('');
      setNote('');
      setPrezzo('');
      setNovita(false);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <tr className={`riga-aggiunta${bersaglio ? ' bersaglio' : ''}`} data-categoria={categoriaId}>
        <td className="maniglia">+</td>
        <td>
          <select value={settore} onChange={(e) => setSettore(e.target.value as Settore)} aria-label="Settore del nuovo piatto">
            {SETTORI.map((s) => (
              <option key={s} value={s}>
                {NOME_SETTORE[s]}
              </option>
            ))}
          </select>
        </td>
        <td className="colonna-piatto">
          <input
            type="text"
            placeholder="nome del piatto"
            value={nome}
            disabled={inCorso}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Nome del nuovo piatto"
          />
        </td>
        <td className="colonna-note">
          <input
            type="text"
            placeholder="ingredienti, contorno…"
            value={note}
            disabled={inCorso}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Note del nuovo piatto"
          />
        </td>
        <td>
          <input
            type="text"
            inputMode="decimal"
            className="prezzo"
            placeholder="--,-- €"
            value={prezzo}
            disabled={inCorso}
            onChange={(e) => setPrezzo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Prezzo del nuovo piatto"
          />
        </td>
        <td className="centro">
          <input
            type="checkbox"
            checked={novita}
            disabled={inCorso}
            onChange={(e) => setNovita(e.target.checked)}
            aria-label="Novità: nuovo piatto"
          />
        </td>
        <td colSpan={3} className="centro nota-riga">
          le porzioni si impostano dopo averlo aggiunto
        </td>
        <td>
          <button type="button" className="bottone-aggiungi" disabled={inCorso} onClick={aggiungi}>
            {inCorso ? 'Salvo…' : 'Aggiungi'}
          </button>
        </td>
      </tr>
      {errore && (
        <tr>
          <td colSpan={COLONNE}>
            <p className="errore">{errore}</p>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Intestazione di una portata
// ---------------------------------------------------------------------------

function RigaCategoria({
  categoria,
  colore,
  quantiPiatti,
  primaDellElenco,
  ultimaDellElenco,
  onSposta,
  onElimina,
}: {
  categoria: Categoria;
  colore: string;
  quantiPiatti: number;
  primaDellElenco: boolean;
  ultimaDellElenco: boolean;
  onSposta: (verso: -1 | 1) => void;
  onElimina: () => void;
}) {
  const modificabile = categoria.id !== SENZA_PORTATA;

  return (
    <tr className="riga-categoria">
      <td colSpan={COLONNE}>
        <div className="testata-portata" style={{ ['--portata-colore' as string]: colore }}>
          {modificabile ? (
            <input
              type="text"
              className="nome-portata"
              defaultValue={categoria.nome}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== categoria.nome &&
                updateDoc(doc(db, 'categorie', categoria.id), { nome: e.target.value.trim() })
              }
              aria-label={`Nome della portata ${categoria.nome}`}
            />
          ) : (
            <span className="nome-portata">{categoria.nome}</span>
          )}
          <span className="quanti">{quantiPiatti === 1 ? '1 piatto' : `${quantiPiatti} piatti`}</span>
          {modificabile && (
            <div className="azioni-portata">
              <button type="button" disabled={primaDellElenco} onClick={() => onSposta(-1)} aria-label={`Sposta ${categoria.nome} in su`}>
                ↑
              </button>
              <button type="button" disabled={ultimaDellElenco} onClick={() => onSposta(1)} aria-label={`Sposta ${categoria.nome} in giù`}>
                ↓
              </button>
              <button type="button" className="bottone-annulla" onClick={onElimina}>
                Elimina portata
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Trascinamento dei piatti da una portata all'altra
// ---------------------------------------------------------------------------

interface Bersaglio {
  categoriaId: string;
  /** Piatto davanti al quale finisce quello trascinato; null = in fondo. */
  primaDi: string | null;
}

interface Trascinamento {
  prodottoId: string | null;
  bersaglio: Bersaglio | null;
  inizia: (prodottoId: string) => void;
}

/** Dove finirebbe il piatto se lo si lasciasse qui: si guarda la riga sotto il
 * dito (o il puntatore) e se si è nella sua metà di sopra o di sotto. */
function bersaglioSotto(x: number, y: number): Bersaglio | null {
  const riga = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('tr[data-categoria]') as
    | HTMLTableRowElement
    | undefined
    | null;
  if (!riga) return null;
  const categoriaId = riga.dataset.categoria!;
  const prodottoId = riga.dataset.prodotto;
  // La riga "aggiungi un piatto" chiude la portata: lasciarci sopra vuol dire
  // mettere il piatto in fondo.
  if (!prodottoId) return { categoriaId, primaDi: null };

  const area = riga.getBoundingClientRect();
  if (y < area.top + area.height / 2) return { categoriaId, primaDi: prodottoId };

  let successiva = riga.nextElementSibling as HTMLElement | null;
  while (successiva && !successiva.dataset.categoria) successiva = successiva.nextElementSibling as HTMLElement | null;
  return { categoriaId, primaDi: successiva?.dataset.prodotto ?? null };
}

/** Trascinamento con gli eventi del puntatore invece del meccanismo nativo del
 * browser: quello non funziona col dito sui tablet, e qui il menù si sistema
 * anche da lì. */
function useTrascinamento(prodotti: Prodotto[], segnalaErrore: (m: string | null) => void): Trascinamento {
  const [prodottoId, setProdottoId] = useState<string | null>(null);
  const [bersaglio, setBersaglio] = useState<Bersaglio | null>(null);
  const bersaglioRef = useRef<Bersaglio | null>(null);
  const prodottiRef = useRef(prodotti);
  prodottiRef.current = prodotti;

  /** Rinumera la portata di destinazione da capo, di dieci in dieci, e scrive
   * solo i piatti che hanno davvero cambiato posto. */
  const deposita = useCallback(
    async (idInVolo: string, dove: Bersaglio) => {
      const elenco = prodottiRef.current;
      const inVolo = elenco.find((p) => p.id === idInVolo);
      if (!inVolo) return;

      const destinazione = elenco.filter((p) => p.categoriaId === dove.categoriaId && p.id !== inVolo.id);
      const posizione = dove.primaDi === null ? -1 : destinazione.findIndex((p) => p.id === dove.primaDi);
      destinazione.splice(posizione < 0 ? destinazione.length : posizione, 0, inVolo);

      const batch = writeBatch(db);
      let daScrivere = 0;
      destinazione.forEach((p, indice) => {
        const ordine = indice * PASSO_ORDINE;
        if (p.ordine === ordine && p.categoriaId === dove.categoriaId) return;
        batch.update(doc(db, 'prodotti', p.id), { ordine, categoriaId: dove.categoriaId });
        daScrivere++;
      });
      if (daScrivere === 0) return;
      try {
        await batch.commit();
        segnalaErrore(null);
      } catch (err) {
        segnalaErrore(messaggioErrore(err));
      }
    },
    [segnalaErrore]
  );

  useEffect(() => {
    if (!prodottoId) return;

    function muovi(e: PointerEvent) {
      e.preventDefault();
      const nuovo = bersaglioSotto(e.clientX, e.clientY);
      bersaglioRef.current = nuovo;
      setBersaglio((prec) =>
        prec?.categoriaId === nuovo?.categoriaId && prec?.primaDi === nuovo?.primaDi ? prec : nuovo
      );
    }

    function rilascia() {
      const dove = bersaglioRef.current;
      bersaglioRef.current = null;
      setBersaglio(null);
      setProdottoId(null);
      if (dove) deposita(prodottoId!, dove);
    }

    document.body.classList.add('trascinamento-in-corso');
    window.addEventListener('pointermove', muovi, { passive: false });
    window.addEventListener('pointerup', rilascia);
    window.addEventListener('pointercancel', rilascia);
    return () => {
      document.body.classList.remove('trascinamento-in-corso');
      window.removeEventListener('pointermove', muovi);
      window.removeEventListener('pointerup', rilascia);
      window.removeEventListener('pointercancel', rilascia);
    };
  }, [prodottoId, deposita]);

  return { prodottoId, bersaglio, inizia: setProdottoId };
}

// ---------------------------------------------------------------------------
// Pannello
// ---------------------------------------------------------------------------

export function GestioneMenu() {
  const categorie = useCategorie();
  const prodotti = useProdotti();
  const disponibilita = useDisponibilita();
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovaPortata, setNuovaPortata] = useState('');
  const trascinamento = useTrascinamento(prodotti, setErrore);

  const idPresi = useMemo(() => new Set(prodotti.map((p) => p.id)), [prodotti]);

  /** Le portate con i loro piatti, più quella di servizio per gli orfani. */
  const gruppi = useMemo(() => {
    const conosciute = new Set(categorie.map((c) => c.id));
    const elenco = categorie.map((categoria) => ({
      categoria,
      piatti: prodotti.filter((p) => p.categoriaId === categoria.id),
    }));
    const orfani = prodotti.filter((p) => !conosciute.has(p.categoriaId));
    if (orfani.length > 0) {
      elenco.push({
        categoria: { id: SENZA_PORTATA, nome: 'Senza portata', ordine: Infinity },
        piatti: orfani,
      });
    }
    return elenco;
  }, [categorie, prodotti]);

  async function creaPortata() {
    const nome = nuovaPortata.trim();
    if (!nome) return;
    try {
      const id = idLibero(nome, new Set(categorie.map((c) => c.id)));
      const ultima = categorie[categorie.length - 1];
      const categoria: Categoria = { id, nome, ordine: (ultima?.ordine ?? -PASSO_ORDINE) + PASSO_ORDINE };
      await setDoc(doc(db, 'categorie', id), categoria);
      setNuovaPortata('');
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  /** Scambia di posto due portate vicine. */
  async function spostaPortata(indice: number, verso: -1 | 1) {
    const questa = categorie[indice];
    const altra = categorie[indice + verso];
    if (!questa || !altra) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'categorie', questa.id), { ordine: altra.ordine });
    batch.update(doc(db, 'categorie', altra.id), { ordine: questa.ordine });
    try {
      await batch.commit();
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  /** Una portata si elimina solo da vuota: così nessun piatto sparisce per
   * sbaglio insieme a lei. */
  async function eliminaPortata(categoria: Categoria, quantiPiatti: number) {
    if (quantiPiatti > 0) {
      setErrore(
        quantiPiatti === 1
          ? `"${categoria.nome}" contiene ancora un piatto: trascinalo in un’altra portata (o eliminalo) e poi riprova.`
          : `"${categoria.nome}" contiene ancora ${quantiPiatti} piatti: trascinali in un’altra portata (o eliminali) e poi riprova.`
      );
      return;
    }
    if (!window.confirm(`Eliminare la portata "${categoria.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, 'categorie', categoria.id));
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  return (
    <div className="area gestione-menu">
      <section className="riquadro">
        <div className="testata-menu">
          <h2>Menù ({prodotti.length})</h2>
          <div className="nuova-portata">
            <input
              type="text"
              placeholder="nome della portata"
              value={nuovaPortata}
              onChange={(e) => setNuovaPortata(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && creaPortata()}
              aria-label="Nome della nuova portata"
            />
            <button type="button" className="bottone-principale" disabled={!nuovaPortata.trim()} onClick={creaPortata}>
              Crea portata
            </button>
          </div>
        </div>
        <p className="spiegazione">
          Le modifiche si salvano da sole e valgono subito ovunque, anche nel menù dal QR. Cambiare un prezzo non
          tocca gli ordini già incassati. Per spostare un piatto sotto un'altra portata trascinalo per la maniglia
          ⠿ a inizio riga. Il settore e le porzioni di serata restano interni: il cliente non li vede. Le porzioni
          valgono per la serata di oggi — lasciale vuote per i piatti senza limite.
        </p>

        {errore && <p className="errore">{errore}</p>}

        {gruppi.length === 0 ? (
          <p className="vuoto">Nessuna portata: creane una qui sopra (Primi, Secondi…) e poi aggiungi i piatti.</p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-menu">
              <colgroup>
                <col className="col-maniglia" />
                <col className="col-settore" />
                <col className="col-piatto" />
                <col className="col-note" />
                <col className="col-prezzo" />
                <col className="col-novita" />
                <col className="col-porzioni" />
                <col className="col-porzioni" />
                <col className="col-esaurito" />
                <col className="col-elimina" />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>Settore</th>
                  <th>Piatto</th>
                  <th>Note</th>
                  <th>Prezzo</th>
                  <th className="centro">Novità</th>
                  <th className="centro">Porzioni di serata</th>
                  <th className="centro">Porzioni residue</th>
                  <th className="centro">Esaurito</th>
                  <th></th>
                </tr>
              </thead>
              {gruppi.map(({ categoria, piatti }, indice) => (
                <tbody key={categoria.id}>
                  <RigaCategoria
                    categoria={categoria}
                    // I colori girano a rotazione: le portate le crea
                    // l'amministratore, non si possono fissare a una a una.
                    colore={
                      categoria.id === SENZA_PORTATA
                        ? 'var(--text-muted)'
                        : `var(--portata-${(indice % 5) + 1})`
                    }
                    quantiPiatti={piatti.length}
                    primaDellElenco={indice === 0}
                    ultimaDellElenco={indice === categorie.length - 1}
                    onSposta={(verso) => spostaPortata(indice, verso)}
                    onElimina={() => eliminaPortata(categoria, piatti.length)}
                  />
                  {piatti.map((prodotto) => (
                    <RigaPiatto
                      key={prodotto.id}
                      prodotto={prodotto}
                      disponibilita={disponibilita.get(prodotto.id)}
                      trascinamento={trascinamento}
                    />
                  ))}
                  {categoria.id !== SENZA_PORTATA && (
                    <RigaNuovoPiatto
                      categoriaId={categoria.id}
                      ordineInFondo={piatti.length * PASSO_ORDINE}
                      idPresi={idPresi}
                      trascinamento={trascinamento}
                    />
                  )}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
