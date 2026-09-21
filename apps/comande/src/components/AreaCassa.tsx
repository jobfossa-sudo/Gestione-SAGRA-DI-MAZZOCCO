import { useState } from 'react';
import { useOrdiniAperti } from '../hooks';
import { DaFare } from './DaFare';
import { FineSerata } from './FineSerata';
import { NuovoOrdine } from './NuovoOrdine';

const SCHEDE = ['Nuovo ordine', 'Da fare', 'Fine serata'] as const;
type Scheda = (typeof SCHEDE)[number];

export function AreaCassa({ amministratore }: { amministratore: boolean }) {
  const [scheda, setScheda] = useState<Scheda>('Nuovo ordine');
  // Quanto resta in mano alla cassa: ordini arrivati dai tavoli più ordini
  // confermati e non ancora incassati. Si vede dalla linguetta, così nessuno
  // resta dimenticato a fine serata.
  const inSospeso = useOrdiniAperti().filter((o) => o.stato === 'bozza' || o.stato === 'da_pagare').length;

  return (
    <div className="area">
      <nav className="sotto-schede">
        {SCHEDE.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
            {s === 'Da fare' && inSospeso > 0 && <span className="contatore">{inSospeso}</span>}
          </button>
        ))}
      </nav>
      {scheda === 'Nuovo ordine' && <NuovoOrdine />}
      {scheda === 'Da fare' && <DaFare />}
      {scheda === 'Fine serata' && <FineSerata amministratore={amministratore} />}
    </div>
  );
}
