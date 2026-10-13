import { useEdizioneAperta } from '../hooks';

/** La fascia gialla in cima all'app quando si sta provando il sistema: chi
 * guarda questi conti deve sapere che non sono quelli della sagra vera. */
export function FasciaProva() {
  const { edizione } = useEdizioneAperta();
  if (!edizione?.prova) return null;
  return (
    <div className="fascia-prova" role="note">
      Edizione di prova · {edizione.nome} · questi numeri non sono quelli della sagra
    </div>
  );
}
