import { NOME_TIPO_GIORNATA, type Giornata, type Presenza, type TipoGiornata } from '@sagra-mazzocco/shared';
import { arrotonda, oreDellaGiornata, type RigaPersona } from '../services/conti';

/** Le ore si scrivono con la virgola, come si dicono: "4,5". Zero è un
 * trattino, così le righe si leggono. */
export function ore(valore: number): string {
  return valore ? String(valore).replace('.', ',') : '—';
}

/** "sab 11/10": deve stare in testa a una colonna stretta. */
export function dataBreve(data: string): string {
  const giorno = new Date(`${data}T12:00:00`);
  if (Number.isNaN(giorno.getTime())) return data;
  return giorno.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

const SIGLA_TIPO: Record<TipoGiornata, string> = {
  sagra: 'Sagra',
  preparazione: 'Prep.',
  allestimento: 'Allest.',
  smontaggio: 'Smont.',
};

/** Il totale per persona dell'edizione intera. */
export function TabellaTotale({ righe }: { righe: RigaPersona[] }) {
  const somma = (campo: 'giornate' | 'serateServizio' | 'oreServizio' | 'oreExtra' | 'oreTotali') =>
    arrotonda(righe.reduce((totale, r) => totale + r[campo], 0));

  return (
    <table className="tabella-conti tabella-ore">
      <thead>
        <tr>
          <th>Persona</th>
          <th className="destra">Giornate</th>
          <th className="destra">Serate in servizio</th>
          <th className="destra">Ore di servizio</th>
          <th className="destra">Ore extra</th>
          <th className="destra">Totale ore</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((r) => (
          <tr key={r.uid}>
            <td>{r.nome}</td>
            <td className="destra">{r.giornate}</td>
            <td className="destra">{ore(r.serateServizio)}</td>
            <td className="destra">{ore(r.oreServizio)}</td>
            <td className="destra">{ore(r.oreExtra)}</td>
            <td className="destra">
              <strong>{ore(r.oreTotali)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Totale ({righe.length} persone)</td>
          <td className="destra">{somma('giornate')}</td>
          <td className="destra">{ore(somma('serateServizio'))}</td>
          <td className="destra">{ore(somma('oreServizio'))}</td>
          <td className="destra">{ore(somma('oreExtra'))}</td>
          <td className="destra">
            <strong>{ore(somma('oreTotali'))}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** La tabella unica: le persone sulle righe, le giornate sulle colonne, e in
 * ogni casella le ore di quel giorno (servizio + extra). */
export function TabellaGiornate({
  righe,
  giornate,
  presenze,
}: {
  righe: RigaPersona[];
  giornate: Giornata[];
  presenze: Map<string, Presenza[]>;
}) {
  return (
    <table className="tabella-conti tabella-giornate">
      <thead>
        <tr>
          <th>Persona</th>
          {giornate.map((g) => (
            <th key={g.id} className="destra" title={NOME_TIPO_GIORNATA[g.tipo]}>
              {dataBreve(g.data)}
              <small>{SIGLA_TIPO[g.tipo]}</small>
            </th>
          ))}
          <th className="destra">Totale</th>
        </tr>
      </thead>
      <tbody>
        {righe.map((r) => (
          <tr key={r.uid}>
            <td>{r.nome}</td>
            {giornate.map((g) => (
              <td key={g.id} className="destra">
                {ore(r.perGiornata[g.id] ?? 0)}
              </td>
            ))}
            <td className="destra">
              <strong>{ore(r.oreTotali)}</strong>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Totale</td>
          {giornate.map((g) => (
            <td key={g.id} className="destra">
              {ore(oreDellaGiornata(g, presenze.get(g.id) ?? []))}
            </td>
          ))}
          <td className="destra">
            <strong>{ore(arrotonda(righe.reduce((totale, r) => totale + r.oreTotali, 0)))}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
