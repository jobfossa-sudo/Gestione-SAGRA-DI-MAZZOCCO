/** Un numero grande con la sua etichetta: il colpo d'occhio dei conti.
 *
 * Gli stessi toni di Fine serata in Comande, perché è la stessa sagra vista da
 * un'altra scrivania: i soldi in giallo, i conteggi neutri, quello che non
 * torna in rosso. */
export function Quadrato({
  titolo,
  valore,
  tono,
  spiegazione,
}: {
  titolo: string;
  valore: string;
  tono?: 'conteggio' | 'incasso' | 'incasso-totale' | 'uscita' | 'utile' | 'allarme';
  spiegazione?: string;
}) {
  return (
    <section className={`quadrato quadrato-${tono ?? 'conteggio'}`}>
      <h3>{titolo}</h3>
      <p className="valore-quadrato">{valore}</p>
      {spiegazione && <p className="spiegazione">{spiegazione}</p>}
    </section>
  );
}
