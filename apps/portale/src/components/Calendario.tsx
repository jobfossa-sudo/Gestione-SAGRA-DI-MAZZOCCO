import { useState } from 'react';
import { idSerata } from '@sagra-mazzocco/shared';

const GIORNI_SETTIMANA = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

const due = (n: number) => String(n).padStart(2, '0');

/** Il mese di una data AAAA-MM-GG, come [anno, mese da 0 a 11]. */
function meseDi(data: string): [number, number] {
  return [Number(data.slice(0, 4)), Number(data.slice(5, 7)) - 1];
}

/** "ven 3 set": per l'elenco delle serate scelte. */
export function serataBreve(data: string): string {
  return new Date(`${data}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Un mese alla volta, con le frecce per andare avanti e indietro: si tocca
 * un giorno per spuntarlo come serata, lo si ritocca per toglierlo. La
 * settimana comincia di lunedì, come sui calendari di casa. */
export function Calendario({
  scelte,
  onCambia,
  meseIniziale,
  disabilitato = false,
}: {
  /** Le serate spuntate, AAAA-MM-GG. */
  scelte: string[];
  onCambia: (scelte: string[]) => void;
  /** Una data del mese da mostrare per primo. */
  meseIniziale: string;
  disabilitato?: boolean;
}) {
  const [[anno, mese], setMese] = useState(() => meseDi(meseIniziale));
  const oggi = idSerata();

  const sposta = (quanti: number) => {
    const giorno = new Date(anno, mese + quanti, 1);
    setMese([giorno.getFullYear(), giorno.getMonth()]);
  };

  const vuotiPrima = (new Date(anno, mese, 1).getDay() + 6) % 7;
  const giorniNelMese = new Date(anno, mese + 1, 0).getDate();
  const giorni = Array.from({ length: giorniNelMese }, (_, i) => `${anno}-${due(mese + 1)}-${due(i + 1)}`);

  const cambia = (data: string) =>
    onCambia(scelte.includes(data) ? scelte.filter((d) => d !== data) : [...scelte, data].sort());

  const nomeMese = new Date(anno, mese, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

  return (
    <div className="calendario">
      <div className="testa-calendario">
        <button type="button" onClick={() => sposta(-1)} aria-label="Mese prima">
          ◀
        </button>
        <span className="nome-mese">{nomeMese}</span>
        <button type="button" onClick={() => sposta(1)} aria-label="Mese dopo">
          ▶
        </button>
      </div>
      <div className="griglia-calendario">
        {GIORNI_SETTIMANA.map((g, i) => (
          <span key={i} className={`giorno-settimana${i >= 5 ? ' fine-settimana' : ''}`}>
            {g}
          </span>
        ))}
        {Array.from({ length: vuotiPrima }, (_, i) => (
          <span key={`vuoto-${i}`} />
        ))}
        {giorni.map((data) => {
          const spuntato = scelte.includes(data);
          return (
            <button
              key={data}
              type="button"
              className={`giorno${spuntato ? ' spuntato' : ''}${data === oggi ? ' oggi' : ''}`}
              aria-pressed={spuntato}
              aria-label={`${new Date(`${data}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}${spuntato ? ', serata' : ''}`}
              disabled={disabilitato}
              onClick={() => cambia(data)}
            >
              {Number(data.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
