import { doc, writeBatch } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PASSO_ORDINE } from '@sagra-mazzocco/shared';
import { messaggioErrore } from '../services/callables';
import { db } from '../services/firebase';

/** Trascinare una riga da un gruppo all'altro, con gli eventi del puntatore
 * invece del meccanismo nativo del browser: quello non funziona col dito sui
 * tablet, e i menù si sistemano anche da lì.
 *
 * Sta qui e non dentro una schermata perché i menù sono due — quello della
 * sagra, che gestisce l'amministratore, e quello di ciascun banco, che
 * gestisce chi ci lavora — e si comportano allo stesso modo. Cambia solo la
 * cartella in cui stanno le righe. */

/** Il minimo che una riga trascinabile deve avere. Va bene sia per i piatti
 * della sagra sia per le voci di un banco. */
export interface RigaOrdinabile {
  id: string;
  categoriaId: string;
  ordine: number;
}

export interface Bersaglio {
  categoriaId: string;
  /** Riga davanti alla quale finisce quella trascinata; null = in fondo. */
  primaDi: string | null;
}

export interface Trascinamento {
  prodottoId: string | null;
  bersaglio: Bersaglio | null;
  inizia: (prodottoId: string) => void;
}

/** Dove finirebbe la riga se la si lasciasse qui: si guarda la riga sotto il
 * dito (o il puntatore) e se si è nella sua metà di sopra o di sotto. */
function bersaglioSotto(x: number, y: number): Bersaglio | null {
  const riga = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('tr[data-categoria]') as
    | HTMLTableRowElement
    | undefined
    | null;
  if (!riga) return null;
  const categoriaId = riga.dataset.categoria!;
  const prodottoId = riga.dataset.prodotto;
  // La riga "aggiungi" chiude il gruppo: lasciarci sopra vuol dire mettere la
  // voce in fondo.
  if (!prodottoId) return { categoriaId, primaDi: null };

  const area = riga.getBoundingClientRect();
  if (y < area.top + area.height / 2) return { categoriaId, primaDi: prodottoId };

  let successiva = riga.nextElementSibling as HTMLElement | null;
  while (successiva && !successiva.dataset.categoria) successiva = successiva.nextElementSibling as HTMLElement | null;
  return { categoriaId, primaDi: successiva?.dataset.prodotto ?? null };
}

/** @param percorso la cartella in Firestore dove stanno le righe, per esempio
 * `prodotti` oppure `banchi/bar/prodotti`. */
export function useTrascinamento(
  prodotti: RigaOrdinabile[],
  percorso: string,
  segnalaErrore: (m: string | null) => void
): Trascinamento {
  const [prodottoId, setProdottoId] = useState<string | null>(null);
  const [bersaglio, setBersaglio] = useState<Bersaglio | null>(null);
  const bersaglioRef = useRef<Bersaglio | null>(null);
  const prodottiRef = useRef(prodotti);
  prodottiRef.current = prodotti;

  /** Rinumera il gruppo di destinazione da capo, di dieci in dieci, e scrive
   * solo le righe che hanno davvero cambiato posto. */
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
        batch.update(doc(db, percorso, p.id), { ordine, categoriaId: dove.categoriaId });
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
    [percorso, segnalaErrore]
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
