import { useState } from 'react';
import { useOrdiniSerata } from '../hooks';
import { FineSerata } from './FineSerata';
import { NuovoOrdine } from './NuovoOrdine';
import { Ordini } from './Ordini';

const SCHEDE = ['Nuovo ordine', 'Ordini cassa', 'Ordini QR', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

export function AreaCassa() {
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');
  // Quanti ordini dai tavoli aspettano ancora la cassa: si vede dalla
  // linguetta, così nessuno resta dimenticato a fine serata.
  const daIncassare = useOrdiniSerata().filter((o) => o.tipo === 'qr' && o.stato === 'bozza').length;

  // Nuovo ordine e Fine serata usano tutto lo schermo: la prima ha il menù e
  // lo scontrino affiancati, la seconda una fila di quadrati che più sono
  // larghi meglio si leggono da lontano. I riepiloghi restano stretti: sono
  // elenchi, e una riga lunga tutto il monitor si perde di vista.
  const aTuttoSchermo = scheda === 'Nuovo ordine' || scheda === 'Fine serata';

  return (
    <div className={aTuttoSchermo ? 'area larga' : 'area'}>
      <nav className="sotto-schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
            {s === 'Ordini QR' && daIncassare > 0 && <span className="contatore">{daIncassare}</span>}
          </button>
        ))}
      </nav>
      {scheda === 'Nuovo ordine' && <NuovoOrdine />}
      {scheda === 'Ordini cassa' && <Ordini tipo="cassa" />}
      {scheda === 'Ordini QR' && <Ordini tipo="qr" />}
      {scheda === 'Fine serata' && <FineSerata />}
    </div>
  );
}
