import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import {
  NOME_BANCO,
  PASSO_ORDINE,
  type Banco,
  type CategoriaBanco,
  type ProdottoBanco,
} from '@sagra-mazzocco/shared';
import { useCategorieBanco, useProdottiBanco } from '../hooks';
import { messaggioErrore } from '../services/callables';
import { db } from '../services/firebase';
import { idLibero } from '../services/identificativi';
import { SERATA_ID_OGGI } from '../services/serata';
import { useTrascinamento, type Trascinamento } from './trascinamento';

/** Il menù di un banco, gestito da chi ci lavora.
 *
 * È la sorella minore di "Gestione menù" della sagra: stessa tabella, stesso
 * trascinamento, stesse modifiche che si salvano da sole. Le manca quello che
 * a un banco non serve — il settore che prepara (è il banco), la composizione
 * del piatto, le porzioni contate, la novità sul menù del QR — perché una
 * colonna in più da saltare con gli occhi, sotto la sagra, è una colonna che
 * rallenta. */

const COLONNE = 6;

/** Gruppo fittizio dove finiscono le voci il cui gruppo non esiste più. Restano
 * visibili e si possono trascinare al posto giusto invece di sparire. */
const SENZA_GRUPPO = '__senza_gruppo__';

function prezzoInTesto(valore: number): string {
  return `${valore.toFixed(2).replace('.', ',')} €`;
}

/** Accetta "12,50 €", "12.5", "12". Null se non è un prezzo valido. */
function prezzoDaTesto(testo: string): number | null {
  const pulito = testo.replace(/[€\s]/g, '').replace(',', '.');
  const numero = Number(pulito);
  if (pulito === '' || Number.isNaN(numero) || numero < 0) return null;
  return Math.round(numero * 100) / 100;
}

// ---------------------------------------------------------------------------
// Riga di una voce
// ---------------------------------------------------------------------------

function RigaVoce({
  banco,
  prodotto,
  trascinamento,
}: {
  banco: Banco;
  prodotto: ProdottoBanco;
  trascinamento: Trascinamento;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const finito = prodotto.esauritoSerata === SERATA_ID_OGGI;

  async function salvaCampo(campi: Partial<ProdottoBanco>) {
    setInCorso(true);
    setErrore(null);
    try {
      await updateDoc(doc(db, `banchi/${banco}/prodotti`, prodotto.id), campi);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  async function salvaPrezzo(e: React.FocusEvent<HTMLInputElement>) {
    const nuovo = prezzoDaTesto(e.target.value);
    if (nuovo === null) {
      // Un prezzo illeggibile non si salva e non si discute: la casella torna
      // com'era, così non resta a schermo un numero che non esiste in archivio.
      e.target.value = prezzoInTesto(prodotto.prezzo);
      setErrore('Prezzo non valido: scrivi per esempio 3,50.');
      return;
    }
    e.target.value = prezzoInTesto(nuovo);
    if (nuovo !== prodotto.prezzo) await salvaCampo({ prezzo: nuovo });
  }

  async function elimina() {
    if (!window.confirm(`Eliminare "${prodotto.nome}" dal menù ${NOME_BANCO[banco]}?`)) return;
    setInCorso(true);
    try {
      await deleteDoc(doc(db, `banchi/${banco}/prodotti`, prodotto.id));
    } catch (err) {
      setErrore(messaggioErrore(err));
      setInCorso(false);
    }
  }

  const bersaglio =
    trascinamento.bersaglio?.categoriaId === prodotto.categoriaId &&
    trascinamento.bersaglio?.primaDi === prodotto.id;

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
            title="Trascina per spostare la voce"
            onPointerDown={(e) => {
              e.preventDefault();
              trascinamento.inizia(prodotto.id);
            }}
          >
            ⠿
          </span>
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
            placeholder="formato, descrizione…"
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
          {/* "Esaurito" vale per la serata di oggi e si azzera da solo domani:
              è la cosa che al banco si tocca di corsa quando finisce un fusto. */}
          <input
            type="checkbox"
            checked={finito}
            disabled={inCorso}
            onChange={(e) => salvaCampo({ esauritoSerata: e.target.checked ? SERATA_ID_OGGI : null })}
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
// Riga per aggiungere una voce
// ---------------------------------------------------------------------------

function RigaNuovaVoce({
  banco,
  categoriaId,
  ordineInFondo,
  idPresi,
}: {
  banco: Banco;
  categoriaId: string;
  ordineInFondo: number;
  idPresi: Set<string>;
}) {
  const [nome, setNome] = useState('');
  const [note, setNote] = useState('');
  const [prezzo, setPrezzo] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function aggiungi() {
    const nomePulito = nome.trim();
    if (!nomePulito) return;
    const prezzoNumero = prezzoDaTesto(prezzo);
    if (prezzoNumero === null) {
      setErrore('Prezzo non valido: scrivi per esempio 3,50.');
      return;
    }
    setInCorso(true);
    setErrore(null);
    try {
      const id = idLibero(nomePulito, idPresi);
      const voce: ProdottoBanco = {
        id,
        categoriaId,
        nome: nomePulito,
        note: note.trim(),
        prezzo: prezzoNumero,
        ordine: ordineInFondo,
        esauritoSerata: null,
      };
      await setDoc(doc(db, `banchi/${banco}/prodotti`, id), voce);
      setNome('');
      setNote('');
      setPrezzo('');
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <>
      <tr className="riga-nuovo" data-categoria={categoriaId}>
        <td />
        <td className="colonna-piatto">
          <input
            type="text"
            placeholder="nuova voce"
            value={nome}
            disabled={inCorso}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Nome della nuova voce"
          />
        </td>
        <td className="colonna-note">
          <input
            type="text"
            placeholder="formato, descrizione…"
            value={note}
            disabled={inCorso}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && aggiungi()}
            aria-label="Note della nuova voce"
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
            aria-label="Prezzo della nuova voce"
          />
        </td>
        <td />
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
// Intestazione di un gruppo
// ---------------------------------------------------------------------------

function RigaGruppo({
  gruppo,
  colore,
  banco,
  quanteVoci,
  primoDellElenco,
  ultimoDellElenco,
  onSposta,
  onElimina,
}: {
  gruppo: CategoriaBanco;
  colore: string;
  banco: Banco;
  quanteVoci: number;
  primoDellElenco: boolean;
  ultimoDellElenco: boolean;
  onSposta: (verso: -1 | 1) => void;
  onElimina: () => void;
}) {
  const modificabile = gruppo.id !== SENZA_GRUPPO;

  return (
    <tr className="riga-categoria">
      <td colSpan={COLONNE}>
        <div className="testata-portata" style={{ ['--portata-colore' as string]: colore }}>
          {modificabile ? (
            <input
              type="text"
              className="nome-portata"
              defaultValue={gruppo.nome}
              onBlur={(e) =>
                e.target.value.trim() &&
                e.target.value !== gruppo.nome &&
                updateDoc(doc(db, `banchi/${banco}/categorie`, gruppo.id), { nome: e.target.value.trim() })
              }
              aria-label={`Nome del gruppo ${gruppo.nome}`}
            />
          ) : (
            <span className="nome-portata">{gruppo.nome}</span>
          )}
          <span className="quanti">{quanteVoci === 1 ? '1 voce' : `${quanteVoci} voci`}</span>
          {modificabile && (
            <div className="azioni-portata">
              <button type="button" disabled={primoDellElenco} onClick={() => onSposta(-1)} aria-label={`Sposta ${gruppo.nome} in su`}>
                ↑
              </button>
              <button type="button" disabled={ultimoDellElenco} onClick={() => onSposta(1)} aria-label={`Sposta ${gruppo.nome} in giù`}>
                ↓
              </button>
              <button type="button" className="bottone-annulla" onClick={onElimina}>
                Elimina gruppo
              </button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// La scheda
// ---------------------------------------------------------------------------

export function MenuBanco({ banco }: { banco: Banco }) {
  const categorie = useCategorieBanco(banco);
  const prodotti = useProdottiBanco(banco);
  const [errore, setErrore] = useState<string | null>(null);
  const [nuovoGruppo, setNuovoGruppo] = useState('');
  const trascinamento = useTrascinamento(prodotti, `banchi/${banco}/prodotti`, setErrore);

  const idPresi = useMemo(() => new Set(prodotti.map((p) => p.id)), [prodotti]);

  const gruppi = useMemo(() => {
    const conosciuti = new Set(categorie.map((c) => c.id));
    const elenco = categorie.map((gruppo) => ({
      gruppo,
      voci: prodotti.filter((p) => p.categoriaId === gruppo.id),
    }));
    const orfane = prodotti.filter((p) => !conosciuti.has(p.categoriaId));
    if (orfane.length > 0) {
      elenco.push({ gruppo: { id: SENZA_GRUPPO, nome: 'Senza gruppo', ordine: Infinity }, voci: orfane });
    }
    return elenco;
  }, [categorie, prodotti]);

  async function creaGruppo() {
    const nome = nuovoGruppo.trim();
    if (!nome) return;
    try {
      const id = idLibero(nome, new Set(categorie.map((c) => c.id)));
      const ultimo = categorie[categorie.length - 1];
      const gruppo: CategoriaBanco = { id, nome, ordine: (ultimo?.ordine ?? -PASSO_ORDINE) + PASSO_ORDINE };
      await setDoc(doc(db, `banchi/${banco}/categorie`, id), gruppo);
      setNuovoGruppo('');
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  async function spostaGruppo(indice: number, verso: -1 | 1) {
    const questo = categorie[indice];
    const altro = categorie[indice + verso];
    if (!questo || !altro) return;
    const batch = writeBatch(db);
    batch.update(doc(db, `banchi/${banco}/categorie`, questo.id), { ordine: altro.ordine });
    batch.update(doc(db, `banchi/${banco}/categorie`, altro.id), { ordine: questo.ordine });
    try {
      await batch.commit();
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  /** Un gruppo si elimina solo da vuoto: così nessuna voce sparisce per
   * sbaglio insieme a lui. */
  async function eliminaGruppo(gruppo: CategoriaBanco, quanteVoci: number) {
    if (quanteVoci > 0) {
      setErrore(
        quanteVoci === 1
          ? `"${gruppo.nome}" contiene ancora una voce: trascinala in un altro gruppo (o eliminala) e poi riprova.`
          : `"${gruppo.nome}" contiene ancora ${quanteVoci} voci: trascinale in un altro gruppo (o eliminale) e poi riprova.`
      );
      return;
    }
    if (!window.confirm(`Eliminare il gruppo "${gruppo.nome}"?`)) return;
    try {
      await deleteDoc(doc(db, `banchi/${banco}/categorie`, gruppo.id));
      setErrore(null);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  return (
    <div className="gestione-menu">
      <section className="riquadro">
        <div className="testata-menu">
          <h2>
            Menù {NOME_BANCO[banco]} ({prodotti.length})
          </h2>
          <div className="nuova-portata">
            <input
              type="text"
              placeholder="nome del gruppo"
              value={nuovoGruppo}
              onChange={(e) => setNuovoGruppo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && creaGruppo()}
              aria-label="Nome del nuovo gruppo"
            />
            <button type="button" className="bottone-principale" disabled={!nuovoGruppo.trim()} onClick={creaGruppo}>
              Crea gruppo
            </button>
          </div>
        </div>
        <p className="spiegazione">
          Questo menù è tuo: lo vedi solo tu al banco {NOME_BANCO[banco]}, e non c'entra niente con il menù della
          sagra. Le modifiche si salvano da sole e valgono subito. Per spostare una voce sotto un altro gruppo
          trascinala per la maniglia ⠿ a inizio riga. <strong>Esaurito</strong> vale per stasera e si azzera da solo
          domani; cambiare un prezzo non tocca gli scontrini già battuti.
        </p>

        {errore && <p className="errore">{errore}</p>}

        {gruppi.length === 0 ? (
          <p className="vuoto">
            Nessun gruppo: creane uno qui sopra (Birre, Caffetteria…) e poi aggiungi le voci da vendere.
          </p>
        ) : (
          <div className="tabella-scroll">
            <table className="tabella-menu tabella-menu-banco">
              <colgroup>
                <col className="col-maniglia" />
                <col className="col-piatto" />
                <col className="col-note" />
                <col className="col-prezzo" />
                <col className="col-esaurito" />
                <col className="col-elimina" />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>Voce</th>
                  <th>Note</th>
                  <th>Prezzo</th>
                  <th className="centro">Esaurito</th>
                  <th></th>
                </tr>
              </thead>
              {gruppi.map(({ gruppo, voci }, indice) => (
                <tbody key={gruppo.id}>
                  <RigaGruppo
                    gruppo={gruppo}
                    banco={banco}
                    colore={gruppo.id === SENZA_GRUPPO ? 'var(--text-muted)' : `var(--portata-${(indice % 5) + 1})`}
                    quanteVoci={voci.length}
                    primoDellElenco={indice === 0}
                    ultimoDellElenco={indice === categorie.length - 1}
                    onSposta={(verso) => spostaGruppo(indice, verso)}
                    onElimina={() => eliminaGruppo(gruppo, voci.length)}
                  />
                  {voci.map((prodotto) => (
                    <RigaVoce key={prodotto.id} banco={banco} prodotto={prodotto} trascinamento={trascinamento} />
                  ))}
                  {gruppo.id !== SENZA_GRUPPO && (
                    <RigaNuovaVoce
                      banco={banco}
                      categoriaId={gruppo.id}
                      ordineInFondo={voci.length * PASSO_ORDINE}
                      idPresi={idPresi}
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
