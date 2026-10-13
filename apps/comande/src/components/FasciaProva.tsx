import { useEdizioneAperta } from '../hooks';

/** La fascia gialla in cima all'app quando si sta provando il sistema: chi
 * passa davanti a una cassa deve capire al volo che non è la sagra vera. */
export function FasciaProva() {
  const { edizione } = useEdizioneAperta();
  if (!edizione?.prova) return null;
  return (
    <div className="fascia-prova" role="note">
      Edizione di prova · {edizione.nome} · questi ordini non sono quelli della sagra
    </div>
  );
}
