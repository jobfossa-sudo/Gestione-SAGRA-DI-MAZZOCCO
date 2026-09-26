import { METODI_PAGAMENTO, NOME_PAGAMENTO, type MetodoPagamento } from '@sagra-mazzocco/shared';

/** Contanti o POS, sopra il tasto che incassa.
 *
 * Non è una domanda in più da fare al cliente: è quello che sta già
 * succedendo sul banco mentre lo si preme. Parte su "Contanti", che alla sagra
 * è il caso di gran lunga più frequente, e torna lì da solo dopo ogni ordine —
 * altrimenti basta dimenticarsene una volta per far quadrare male il cassetto
 * per tutta la sera.
 *
 * Serve alla chiusura di fine serata: senza, l'app sa quanto ha incassato ma
 * non sa quanto deve esserci nel cassetto. */
export function SceltaPagamento({
  valore,
  onCambia,
  disabilitato,
}: {
  valore: MetodoPagamento;
  onCambia: (metodo: MetodoPagamento) => void;
  disabilitato?: boolean;
}) {
  return (
    <div className="scelta-pagamento">
      <span className="etichetta-pagamento">Come paga?</span>
      <div className="tasti-pagamento" role="group" aria-label="Metodo di pagamento">
        {METODI_PAGAMENTO.map((metodo) => (
          <button
            key={metodo}
            type="button"
            className={metodo === valore ? 'scelto' : ''}
            aria-pressed={metodo === valore}
            disabled={disabilitato}
            onClick={() => onCambia(metodo)}
          >
            <span aria-hidden="true">{metodo === 'contanti' ? '💶' : '💳'}</span> {NOME_PAGAMENTO[metodo]}
          </button>
        ))}
      </div>
    </div>
  );
}
