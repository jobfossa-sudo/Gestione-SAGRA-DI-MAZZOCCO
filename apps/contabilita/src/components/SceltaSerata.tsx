import type { Serata } from '@sagra-mazzocco/shared';

/** Di quale sera stiamo parlando. Sta sotto le schede e resta fermo mentre si
 * passa dal cruscotto alla chiusura alle presenze: sono tre sguardi diversi
 * sulla stessa serata, e doverla riscegliere ogni volta sarebbe una noia. */
export function SceltaSerata({
  serate,
  scelta,
  onCambia,
}: {
  serate: Serata[];
  scelta: string | null;
  onCambia: (serataId: string) => void;
}) {
  if (serate.length === 0) return null;

  return (
    <div className="scelta-serata">
      <label>
        Serata
        <select value={scelta ?? ''} onChange={(e) => onCambia(e.target.value)}>
          {serate.map((serata) => (
            <option key={serata.id} value={serata.id}>
              {nomeSerata(serata.id)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** "sabato 26 settembre 2026" invece di "2026-09-26": i conti si guardano
 * insieme ad altre persone, e nessuno parla per date rovesciate. */
export function nomeSerata(serataId: string): string {
  const data = new Date(`${serataId}T12:00:00`);
  if (Number.isNaN(data.getTime())) return serataId;
  return data.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
