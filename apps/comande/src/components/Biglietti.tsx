import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  BLOCCHI_OBBLIGATORI,
  FORMATI_CARTA,
  MISURE_CARTA,
  NOME_BIGLIETTO,
  NOME_BLOCCO,
  SPIEGAZIONE_BIGLIETTO,
  TIPI_BIGLIETTO,
  TIPI_BLOCCO,
  type Biglietto,
  type BloccoBiglietto,
  type Colonna,
  type Grandezza,
  type TipoBiglietto,
  type TipoBlocco,
  type Ordine,
} from '@sagra-mazzocco/shared';
import { useBiglietti, useImmagini } from '../hooks';
import { messaggioErrore } from '../services/callables';
import { db } from '../services/firebase';
import { FoglioComposto } from './FoglioComposto';
import { GalleriaImmagini } from './Immagini';
import { stampa } from './AreaStampa';

/** Un ordine finto per l'anteprima e per la stampa di prova: la schermata si
 * deve poter sistemare anche di giorno, senza ordini veri in giro. */
const ORDINE_ESEMPIO: Ordine = {
  id: 'esempio',
  serataId: 'esempio',
  numero: 1,
  cassa: 'A',
  codice: 'A0001',
  codiceBarre: 'A0001202706121930A',
  stato: 'da_pagare',
  tipo: 'cassa',
  tavolo: 12,
  coperti: 4,
  items: [
    { prodottoId: 'pasta', nome: 'Pasta al ragù', settore: 'cucina', prezzo: 7, quantita: 2 },
    { prodottoId: 'grigliata', nome: 'Grigliata mista', settore: 'griglia', prezzo: 10, quantita: 2 },
    { prodottoId: 'patatine', nome: 'Patatine fritte', settore: 'cucina', prezzo: 3, quantita: 1 },
    { prodottoId: 'birra', nome: 'Birra', settore: 'bar', prezzo: 3, quantita: 4 },
  ],
  totale: 2 * 7 + 2 * 10 + 3 + 4 * 3,
  createdAt: { seconds: 0, nanoseconds: 0 },
  confirmedAt: null,
  completedAt: null,
  cancelledAt: null,
};

const GRANDEZZE: Grandezza[] = ['piccolo', 'normale', 'grande', 'enorme', 'gigante'];
const NOME_GRANDEZZA: Record<Grandezza, string> = {
  piccolo: 'Piccolo',
  normale: 'Normale',
  grande: 'Grande',
  enorme: 'Enorme',
  gigante: 'Gigantesco',
};
const NOME_COLONNA: Record<Colonna, string> = {
  intera: 'Tutta la larghezza',
  sinistra: 'Colonna di sinistra',
  destra: 'Colonna di destra',
};

/** Un blocco nuovo, con impostazioni sensate per il suo tipo. */
function bloccoNuovo(tipo: TipoBlocco, presi: Set<string>): BloccoBiglietto {
  let id: string = tipo;
  for (let n = 2; presi.has(id); n++) id = `${tipo}-${n}`;
  const base: BloccoBiglietto = { id, tipo, attivo: true, colonna: 'intera', allineamento: 'sinistra' };
  switch (tipo) {
    case 'titolo':
      return { ...base, testo: 'Sagra di Mazzocco', grandezza: 'grande', grassetto: true };
    case 'testo':
      return { ...base, testo: 'Scrivi qui', grandezza: 'normale' };
    case 'codice':
      return { ...base, grandezza: 'gigante', grassetto: true, allineamento: 'centro' };
    case 'tavolo':
      return { ...base, mostraCoperti: true, grandezza: 'grande' };
    case 'voci':
      return { ...base, mostraPrezzi: true };
    case 'totale':
      return { ...base, grandezza: 'grande', allineamento: 'destra' };
    case 'codiceBarre':
      return { ...base, mostraRigaLeggibile: true, allineamento: 'centro' };
    case 'immagine':
      return { ...base, immagineId: null, larghezzaMm: 40, allineamento: 'centro' };
    case 'spazio':
      return { ...base, altezzaMm: 5 };
    default:
      return base;
  }
}

export function Biglietti() {
  const salvati = useBiglietti();
  const immagini = useImmagini();
  const [tipo, setTipo] = useState<TipoBiglietto>('resoconto');
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  /** Quello che si sta componendo adesso. Si tiene qui e non si rilegge dal
   * database a ogni modifica: il giro fino al server e ritorno dura qualche
   * decimo di secondo, e due spunte cliccate in fretta si annullerebbero a
   * vicenda, perché la seconda partirebbe dalla versione di prima. */
  const [inLavorazione, setInLavorazione] = useState<Partial<Record<TipoBiglietto, Biglietto>>>({});
  const biglietto = inLavorazione[tipo] ?? salvati[tipo];
  const obbligatori = BLOCCHI_OBBLIGATORI[tipo];

  /** Ogni modifica si salva subito: l'anteprima e le stampe la usano da quel
   * momento, su tutti i computer. */
  async function salva(nuovo: Biglietto) {
    setErrore(null);
    setMessaggio(null);
    setInLavorazione((prec) => ({ ...prec, [nuovo.id]: nuovo }));
    try {
      await setDoc(doc(db, 'biglietti', nuovo.id), nuovo);
    } catch (err) {
      setErrore(messaggioErrore(err));
      // Se il salvataggio non è andato, si torna a mostrare quello che c'è
      // davvero nel database, per non far credere salvata una modifica persa.
      setInLavorazione((prec) => {
        const copia = { ...prec };
        delete copia[nuovo.id];
        return copia;
      });
    }
  }

  function cambiaBlocco(id: string, campi: Partial<BloccoBiglietto>) {
    salva({ ...biglietto, blocchi: biglietto.blocchi.map((b) => (b.id === id ? { ...b, ...campi } : b)) });
  }

  function aggiungiBlocco(nuovoTipo: TipoBlocco) {
    const presi = new Set(biglietto.blocchi.map((b) => b.id));
    salva({ ...biglietto, blocchi: [...biglietto.blocchi, bloccoNuovo(nuovoTipo, presi)] });
  }

  function togliBlocco(id: string) {
    const blocco = biglietto.blocchi.find((b) => b.id === id);
    if (!blocco) return;
    if (obbligatori.includes(blocco.tipo)) return;
    if (!window.confirm(`Togliere il blocco "${NOME_BLOCCO[blocco.tipo]}" da questo biglietto?`)) return;
    salva({ ...biglietto, blocchi: biglietto.blocchi.filter((b) => b.id !== id) });
  }

  function spostaBlocco(id: string, primaDi: string | null) {
    const elenco = biglietto.blocchi.filter((b) => b.id !== id);
    const inVolo = biglietto.blocchi.find((b) => b.id === id);
    if (!inVolo) return;
    const posizione = primaDi === null ? elenco.length : elenco.findIndex((b) => b.id === primaDi);
    elenco.splice(posizione < 0 ? elenco.length : posizione, 0, inVolo);
    if (elenco.every((b, i) => b.id === biglietto.blocchi[i]?.id)) return;
    salva({ ...biglietto, blocchi: elenco });
  }

  async function ripristina() {
    if (!window.confirm(`Rimettere "${NOME_BIGLIETTO[tipo]}" come era all'inizio? Le modifiche vanno perse.`)) return;
    setErrore(null);
    setInLavorazione((prec) => {
      const copia = { ...prec };
      delete copia[tipo];
      return copia;
    });
    try {
      // Cancellare il documento fa tornare in vigore la disposizione di
      // partenza, senza doverla copiare qui.
      await deleteDoc(doc(db, 'biglietti', tipo));
      setMessaggio(`"${NOME_BIGLIETTO[tipo]}" è tornato come all'inizio.`);
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  const trascinamento = useTrascinamento(spostaBlocco);

  return (
    <div className="biglietti">
      <div className="colonna-composizione">
        <section className="riquadro">
          <nav className="sotto-schede">
            {TIPI_BIGLIETTO.map((t) => (
              <button key={t} type="button" className={t === tipo ? 'attiva' : ''} onClick={() => setTipo(t)}>
                {NOME_BIGLIETTO[t]}
              </button>
            ))}
          </nav>
          <p className="spiegazione">{SPIEGAZIONE_BIGLIETTO[tipo]}</p>

          <div className="campi-tavolo">
            <label>
              Carta
              <select
                value={biglietto.formato}
                onChange={(e) => salva({ ...biglietto, formato: e.target.value as Biglietto['formato'] })}
              >
                {FORMATI_CARTA.map((f) => (
                  <option key={f} value={f}>
                    {MISURE_CARTA[f].nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Margine (mm)
              <input
                type="number"
                min="0"
                max="30"
                value={biglietto.margineMm}
                onChange={(e) => salva({ ...biglietto, margineMm: Math.max(0, Math.min(30, Number(e.target.value))) })}
              />
            </label>
          </div>

          <ul className="elenco-blocchi">
            {biglietto.blocchi.map((blocco) => (
              <RigaBlocco
                key={blocco.id}
                blocco={blocco}
                obbligatorio={obbligatori.includes(blocco.tipo)}
                immagini={[...immagini.values()]}
                inVolo={trascinamento.id === blocco.id}
                bersaglio={trascinamento.bersaglio === blocco.id}
                onTrascina={() => trascinamento.inizia(blocco.id)}
                onCambia={(campi) => cambiaBlocco(blocco.id, campi)}
                onTogli={() => togliBlocco(blocco.id)}
              />
            ))}
            <li className="fine-elenco" data-blocco="">
              Trascina qui per mettere un blocco in fondo.
            </li>
          </ul>

          <div className="aggiungi-blocco">
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) aggiungiBlocco(e.target.value as TipoBlocco);
                e.target.value = '';
              }}
            >
              <option value="">Aggiungi un blocco…</option>
              {TIPI_BLOCCO.map((t) => (
                <option key={t} value={t}>
                  {NOME_BLOCCO[t]}
                </option>
              ))}
            </select>
            <button type="button" onClick={ripristina}>
              Ripristina come all'inizio
            </button>
          </div>

          {errore && <p className="errore">{errore}</p>}
          {messaggio && <p className="successo">{messaggio}</p>}
        </section>

        <GalleriaImmagini />
      </div>

      <div className="colonna-anteprima">
        <section className="riquadro">
          <div className="testata-anteprima">
            <h2>Anteprima</h2>
            <button
              type="button"
              className="bottone-principale"
              onClick={() => stampa([{ tipo, ordine: ORDINE_ESEMPIO }])}
            >
              Stampa una prova
            </button>
          </div>
          <p className="spiegazione">
            Ordine di esempio, nella misura vera della carta ({MISURE_CARTA[biglietto.formato].nome}). Se stampi su
            un foglio più grande, nella finestra di stampa scegli "dimensioni reali" e non "adatta alla pagina".
          </p>
          <div className="cornice-anteprima">
            <FoglioComposto biglietto={biglietto} ordine={ORDINE_ESEMPIO} immagini={immagini} />
          </div>
        </section>
      </div>
    </div>
  );
}

function RigaBlocco({
  blocco,
  obbligatorio,
  immagini,
  inVolo,
  bersaglio,
  onTrascina,
  onCambia,
  onTogli,
}: {
  blocco: BloccoBiglietto;
  obbligatorio: boolean;
  immagini: { id: string; nome: string }[];
  inVolo: boolean;
  bersaglio: boolean;
  onTrascina: () => void;
  onCambia: (campi: Partial<BloccoBiglietto>) => void;
  onTogli: () => void;
}) {
  const conTesto = blocco.tipo === 'titolo' || blocco.tipo === 'testo';
  const conGrandezza = conTesto || ['codice', 'tavolo', 'voci', 'totale'].includes(blocco.tipo);
  const conAllineamento = blocco.tipo !== 'riga' && blocco.tipo !== 'spazio' && blocco.tipo !== 'voci';

  return (
    <li
      className={`riga-blocco${inVolo ? ' in-volo' : ''}${bersaglio ? ' bersaglio' : ''}${blocco.attivo ? '' : ' spento'}`}
      data-blocco={blocco.id}
    >
      <div className="testata-blocco">
        <span
          className="maniglia"
          role="button"
          aria-label={`Sposta ${NOME_BLOCCO[blocco.tipo]}`}
          onPointerDown={(e) => {
            e.preventDefault();
            onTrascina();
          }}
        >
          ⠿
        </span>
        <label className="interruttore">
          <input
            type="checkbox"
            checked={blocco.attivo}
            disabled={obbligatorio}
            title={obbligatorio ? 'Questo blocco serve al funzionamento e non si può spegnere' : undefined}
            onChange={(e) => onCambia({ attivo: e.target.checked })}
          />
          <span className="nome-blocco">{NOME_BLOCCO[blocco.tipo]}</span>
        </label>
        {obbligatorio ? (
          <span className="targhetta-obbligatorio">sempre presente</span>
        ) : (
          <button type="button" className="togli" aria-label={`Togli ${NOME_BLOCCO[blocco.tipo]}`} onClick={onTogli}>
            ✕
          </button>
        )}
      </div>

      <div className="impostazioni-blocco">
        {conTesto && (
          <label className="larga">
            Testo
            <input type="text" value={blocco.testo ?? ''} onChange={(e) => onCambia({ testo: e.target.value })} />
          </label>
        )}

        <label>
          Posizione
          <select value={blocco.colonna} onChange={(e) => onCambia({ colonna: e.target.value as Colonna })}>
            {(Object.keys(NOME_COLONNA) as Colonna[]).map((c) => (
              <option key={c} value={c}>
                {NOME_COLONNA[c]}
              </option>
            ))}
          </select>
        </label>

        {conGrandezza && (
          <label>
            Grandezza
            <select
              value={blocco.grandezza ?? 'normale'}
              onChange={(e) => onCambia({ grandezza: e.target.value as Grandezza })}
            >
              {GRANDEZZE.map((g) => (
                <option key={g} value={g}>
                  {NOME_GRANDEZZA[g]}
                </option>
              ))}
            </select>
          </label>
        )}

        {conAllineamento && (
          <label>
            Allineamento
            <select
              value={blocco.allineamento ?? 'sinistra'}
              onChange={(e) => onCambia({ allineamento: e.target.value as BloccoBiglietto['allineamento'] })}
            >
              <option value="sinistra">A sinistra</option>
              <option value="centro">Al centro</option>
              <option value="destra">A destra</option>
            </select>
          </label>
        )}

        {conTesto && (
          <label className="spunta">
            <input
              type="checkbox"
              checked={blocco.grassetto ?? false}
              onChange={(e) => onCambia({ grassetto: e.target.checked })}
            />
            Grassetto
          </label>
        )}

        {blocco.tipo === 'voci' && (
          <>
            <label className="spunta">
              <input
                type="checkbox"
                checked={blocco.mostraPrezzi ?? false}
                onChange={(e) => onCambia({ mostraPrezzi: e.target.checked })}
              />
              Prezzi
            </label>
            <label className="spunta">
              <input
                type="checkbox"
                checked={blocco.caselleSpunta ?? false}
                onChange={(e) => onCambia({ caselleSpunta: e.target.checked })}
              />
              Quadratini da spuntare
            </label>
          </>
        )}

        {blocco.tipo === 'tavolo' && (
          <label className="spunta">
            <input
              type="checkbox"
              checked={blocco.mostraCoperti ?? false}
              onChange={(e) => onCambia({ mostraCoperti: e.target.checked })}
            />
            Coperti
          </label>
        )}

        {blocco.tipo === 'codiceBarre' && (
          <label className="spunta">
            <input
              type="checkbox"
              checked={blocco.mostraRigaLeggibile ?? false}
              onChange={(e) => onCambia({ mostraRigaLeggibile: e.target.checked })}
            />
            Codice scritto sotto
          </label>
        )}

        {blocco.tipo === 'spazio' && (
          <label>
            Altezza (mm)
            <input
              type="number"
              min="1"
              max="60"
              value={blocco.altezzaMm ?? 5}
              onChange={(e) => onCambia({ altezzaMm: Number(e.target.value) })}
            />
          </label>
        )}

        {blocco.tipo === 'immagine' && (
          <>
            <label>
              Immagine
              <select
                value={blocco.immagineId ?? ''}
                onChange={(e) => onCambia({ immagineId: e.target.value || null })}
              >
                <option value="">— scegli —</option>
                {immagini.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Larghezza (mm)
              <input
                type="number"
                min="5"
                max="180"
                value={blocco.larghezzaMm ?? 40}
                onChange={(e) => onCambia({ larghezzaMm: Number(e.target.value) })}
              />
            </label>
            {immagini.length === 0 && <p className="avviso-campi">Carica un'immagine qui sotto per poterla scegliere.</p>}
          </>
        )}
      </div>
    </li>
  );
}

/** Trascinamento col puntatore (non il meccanismo nativo del browser, che col
 * dito sui tablet non funziona): si guarda il blocco sotto il dito e se si è
 * nella sua metà di sopra o di sotto. */
function useTrascinamento(sposta: (id: string, primaDi: string | null) => void) {
  const [id, setId] = useState<string | null>(null);
  const [bersaglio, setBersaglio] = useState<string | null>(null);
  const bersaglioRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id) return;

    function dove(x: number, y: number): string | null | undefined {
      const riga = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-blocco]') as
        | HTMLElement
        | null
        | undefined;
      if (!riga) return undefined;
      const suId = riga.dataset.blocco;
      if (!suId) return null; // la riga finale: in fondo
      const area = riga.getBoundingClientRect();
      if (y < area.top + area.height / 2) return suId;
      const dopo = riga.nextElementSibling as HTMLElement | null;
      return dopo?.dataset.blocco || null;
    }

    function muovi(e: PointerEvent) {
      e.preventDefault();
      const nuovo = dove(e.clientX, e.clientY);
      if (nuovo === undefined) return;
      bersaglioRef.current = nuovo;
      setBersaglio(nuovo);
    }

    function rilascia() {
      const destinazione = bersaglioRef.current;
      bersaglioRef.current = null;
      setBersaglio(null);
      setId(null);
      if (destinazione !== id) sposta(id!, destinazione ?? null);
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
  }, [id, sposta]);

  return { id, bersaglio, inizia: setId };
}
