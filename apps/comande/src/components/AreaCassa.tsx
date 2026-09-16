import { useState } from 'react';
import { ConfermaBozza } from './ConfermaBozza';
import { FineSerata } from './FineSerata';
import { NuovoOrdine } from './NuovoOrdine';

const SCHEDE = ['Nuovo ordine', 'Conferma bozza', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

export function AreaCassa({ amministratore }: { amministratore: boolean }) {
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');

  return (
    <div className="area">
      <nav className="sotto-schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
          </button>
        ))}
      </nav>
      {scheda === 'Nuovo ordine' && <NuovoOrdine />}
      {scheda === 'Conferma bozza' && <ConfermaBozza />}
      {scheda === 'Fine serata' && <FineSerata amministratore={amministratore} />}
    </div>
  );
}
