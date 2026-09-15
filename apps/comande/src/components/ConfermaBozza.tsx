import { useState } from 'react';
import { confermaOrdine, messaggioErrore } from '../services/callables';
import { SERATA_ID_OGGI } from '../services/serata';

export function ConfermaBozza() {
  const [numero, setNumero] = useState('');
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [messaggioSuccesso, setMessaggioSuccesso] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setMessaggioSuccesso(null);
    setInCorso(true);
    try {
      const risultato = await confermaOrdine({ serataId: SERATA_ID_OGGI, numero: Number(numero) });
      const totale = risultato.data.totale.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
      setMessaggioSuccesso(`Ordine n. ${risultato.data.numero} confermato e inviato ai reparti — ${totale}`);
      setNumero('');
    } catch (err) {
      setErrore(messaggioErrore(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <form className="conferma-bozza" onSubmit={handleSubmit}>
      <h2>Conferma un ordine dal tavolo</h2>
      <p className="spiegazione">
        Il cliente ha ordinato dal telefono inquadrando il QR: chiedigli il numero mostrato sullo schermo, incassa e
        conferma qui. Solo allora l'ordine parte verso cucina e bar.
      </p>
      <label>
        Numero ordine
        <input type="number" min="1" placeholder="000" value={numero} onChange={(e) => setNumero(e.target.value)} required autoFocus />
      </label>
      {errore && <p className="errore">{errore}</p>}
      {messaggioSuccesso && <p className="successo">{messaggioSuccesso}</p>}
      <button type="submit" className="bottone-principale" disabled={inCorso}>
        {inCorso ? 'Conferma in corso…' : 'Conferma e invia ai reparti'}
      </button>
    </form>
  );
}
