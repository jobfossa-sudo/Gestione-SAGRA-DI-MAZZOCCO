import { useState } from 'react';
import { useOrdiniAperti } from '../hooks';
import { ConfermaBozza } from './ConfermaBozza';
import { DaIncassare } from './DaIncassare';
import { FineSerata } from './FineSerata';
import { NuovoOrdine } from './NuovoOrdine';

const SCHEDE = ['Nuovo ordine', 'Conferma bozza', 'Da incassare', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

export function AreaCassa({ amministratore }: { amministratore: boolean }) {
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');
  // Quanti ordini aspettano l'incasso: si vede dalla linguetta, così nessuno
  // resta dimenticato a fine serata.
  const inAttesa = useOrdiniAperti().filter((o) => o.stato === 'da_pagare').length;

  return (
    <div className="area">
      <nav className="sotto-schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
            {s === 'Da incassare' && inAttesa > 0 && <span className="contatore">{inAttesa}</span>}
          </button>
        ))}
      </nav>
      {scheda === 'Nuovo ordine' && <NuovoOrdine />}
      {scheda === 'Conferma bozza' && <ConfermaBozza />}
      {scheda === 'Da incassare' && <DaIncassare />}
      {scheda === 'Fine serata' && <FineSerata amministratore={amministratore} />}
    </div>
  );
}
