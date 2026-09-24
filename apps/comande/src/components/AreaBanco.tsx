import { useState } from 'react';
import { BANCO_CON_COMANDE, NOME_BANCO, SETTORE_DEL_BANCO, type Banco } from '@sagra-mazzocco/shared';
import { useSottoOrdiniDaEvadere } from '../hooks';
import { CassaBanco } from './CassaBanco';
import { ComandeBanco } from './ComandeBanco';
import { MenuBanco } from './MenuBanco';
import { OrdiniBanco } from './OrdiniBanco';

/** La finestra di un banco: BAR e BEVANDE sono la stessa schermata con dentro
 * un id diverso.
 *
 * Tre schede uguali per tutti e due — il menù che si gestisce da soli, la
 * cassa dove si vende, l'archivio della serata — più una quarta al solo banco
 * BEVANDE, dove arrivano le comande del bere partite dalla cassa dei tavoli. */
export function AreaBanco({ banco }: { banco: Banco }) {
  const riceveComande = banco === BANCO_CON_COMANDE;
  const schede = riceveComande
    ? (['Gestione Menù', 'Cassa', 'Comande dalla cassa', 'Ordini'] as const)
    : (['Gestione Menù', 'Cassa', 'Ordini'] as const);
  type Scheda = (typeof schede)[number];

  // Si apre sulla cassa: è lì che si lavora tutta la sera. Il menù si sistema
  // una volta, prima di cominciare.
  const [scheda, setScheda] = useState<Scheda>('Cassa');

  // Quante comande del bere aspettano: si vede dalla linguetta anche mentre si
  // sta battendo uno scontrino, così nessuna resta ferma.
  const daPreparare = useSottoOrdiniDaEvadere().filter(
    (s) => s.settore === SETTORE_DEL_BANCO && s.stato === 'in_preparazione'
  ).length;

  // Il menù e la cassa vogliono tutta la larghezza: il primo è una tabella
  // fitta, la seconda ha il listino e lo scontrino affiancati.
  const aTuttoSchermo = scheda === 'Gestione Menù';

  return (
    <div className={aTuttoSchermo ? 'area larga' : 'area'}>
      <nav className="sotto-schede">
        {schede.map((s) => (
          <button key={s} type="button" className={s === scheda ? 'attiva' : ''} onClick={() => setScheda(s)}>
            {s}
            {s === 'Comande dalla cassa' && daPreparare > 0 && <span className="contatore">{daPreparare}</span>}
          </button>
        ))}
      </nav>

      <p className="targhetta-banco">Banco {NOME_BANCO[banco]}</p>

      {scheda === 'Gestione Menù' && <MenuBanco banco={banco} />}
      {scheda === 'Cassa' && <CassaBanco banco={banco} />}
      {scheda === 'Comande dalla cassa' && <ComandeBanco />}
      {scheda === 'Ordini' && <OrdiniBanco banco={banco} />}
    </div>
  );
}
