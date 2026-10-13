import { useEdizioneAperta } from '../hooks';

/** La fascia gialla in cima all'app quando si sta provando il sistema. */
export function FasciaProva() {
  const { edizione } = useEdizioneAperta();
  if (!edizione?.prova) return null;
  return (
    <div className="fascia-prova" role="note">
      Edizione di prova · {edizione.nome} · i numeri di queste serate non sono quelli della sagra
    </div>
  );
}
