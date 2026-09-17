import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useRef, useState } from 'react';
import { BYTE_MASSIMI_IMMAGINE, type Immagine } from '@sagra-mazzocco/shared';
import { useImmagini } from '../hooks';
import { messaggioErrore } from '../services/callables';
import { db } from '../services/firebase';
import { idLibero } from '../services/identificativi';

/** Quanto larga si tiene un'immagine: più del doppio della larghezza di
 * stampa, così resta nitida sulla carta senza pesare. */
const LARGHEZZA_MASSIMA = 1000;

function pesoLeggibile(byte: number): string {
  return byte < 1024 * 1024 ? `${Math.round(byte / 1024)} kB` : `${(byte / 1024 / 1024).toFixed(1)} MB`;
}

/** Rimpicciolisce l'immagine scelta e la restituisce come testo, pronta da
 * salvare. I disegni a pochi colori restano PNG (i bordi restano netti), le
 * fotografie diventano JPEG, che pesa molto meno. */
function preparaImmagine(file: File): Promise<{ dati: string; larghezza: number; altezza: number }> {
  return new Promise((risolvi, rifiuta) => {
    const lettore = new FileReader();
    lettore.onerror = () => rifiuta(new Error('Non riesco a leggere il file.'));
    lettore.onload = () => {
      const img = new Image();
      img.onerror = () => rifiuta(new Error('Il file non sembra un’immagine.'));
      img.onload = () => {
        const scala = Math.min(1, LARGHEZZA_MASSIMA / img.width);
        const larghezza = Math.max(1, Math.round(img.width * scala));
        const altezza = Math.max(1, Math.round(img.height * scala));
        const tela = document.createElement('canvas');
        tela.width = larghezza;
        tela.height = altezza;
        const pennello = tela.getContext('2d');
        if (!pennello) return rifiuta(new Error('Il browser non riesce a preparare l’immagine.'));
        pennello.drawImage(img, 0, 0, larghezza, altezza);

        const png = tela.toDataURL('image/png');
        const jpeg = tela.toDataURL('image/jpeg', 0.85);
        const dati = png.length <= jpeg.length ? png : jpeg;
        risolvi({ dati, larghezza, altezza });
      };
      img.src = lettore.result as string;
    };
    lettore.readAsDataURL(file);
  });
}

/** Le immagini da usare nei biglietti: logo della sagra, stemma del paese,
 * marchio di uno sponsor. */
export function GalleriaImmagini() {
  const immagini = useImmagini();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  async function carica(file: File) {
    setErrore(null);
    setInCorso(true);
    try {
      const { dati, larghezza, altezza } = await preparaImmagine(file);
      if (dati.length > BYTE_MASSIMI_IMMAGINE) {
        throw new Error(
          `L'immagine pesa ancora ${pesoLeggibile(dati.length)} dopo il rimpicciolimento: usane una più semplice o più piccola.`
        );
      }
      const nome = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'immagine';
      const id = idLibero(nome, new Set(immagini.keys()));
      const immagine: Immagine = {
        id,
        nome,
        dati,
        larghezza,
        altezza,
        byte: dati.length,
        createdAt: serverTimestamp() as unknown as Immagine['createdAt'],
      };
      await setDoc(doc(db, 'immagini', id), immagine);
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
      if (campo.current) campo.current.value = '';
    }
  }

  async function elimina(immagine: Immagine) {
    if (!window.confirm(`Eliminare l'immagine "${immagine.nome}"? I biglietti che la usano resteranno senza.`)) return;
    setErrore(null);
    try {
      await deleteDoc(doc(db, 'immagini', immagine.id));
    } catch (err) {
      setErrore(messaggioErrore(err));
    }
  }

  const elenco = [...immagini.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  return (
    <section className="riquadro galleria-immagini">
      <h2>
        Immagini <span className="contatore">{elenco.length}</span>
      </h2>
      <p className="spiegazione">
        Logo, stemma o marchio di uno sponsor, da mettere nei biglietti col blocco "Immagine". Le rimpicciolisco da
        sole. Ricorda che le stampanti della sagra sono in bianco e nero: un disegno a tratto forte si vede meglio
        di una fotografia.
      </p>

      <label className="carica-immagine">
        {inCorso ? 'Sto preparando l’immagine…' : 'Scegli un file dal computer'}
        <input
          ref={campo}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          disabled={inCorso}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) carica(file);
          }}
        />
      </label>

      {errore && <p className="errore">{errore}</p>}

      {elenco.length === 0 ? (
        <p className="vuoto">Nessuna immagine caricata.</p>
      ) : (
        <ul className="elenco-immagini">
          {elenco.map((immagine) => (
            <li key={immagine.id}>
              <img src={immagine.dati} alt={immagine.nome} />
              <span className="dettagli">
                <span className="nome-immagine">{immagine.nome}</span>
                <span className="misura">
                  {immagine.larghezza}×{immagine.altezza} · {pesoLeggibile(immagine.byte)}
                </span>
              </span>
              <button type="button" className="togli" aria-label={`Elimina ${immagine.nome}`} onClick={() => elimina(immagine)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
