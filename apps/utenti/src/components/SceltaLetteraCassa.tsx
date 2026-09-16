import { LETTERE_CASSA } from '@sagra-mazzocco/shared';

/** Tendina con le lettere della cassa: "—" vuol dire nessuna lettera. */
export function SceltaLetteraCassa({
  valore,
  onChange,
  disabled,
  ariaLabel,
}: {
  valore: string | null;
  onChange: (lettera: string | null) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      className="scelta-lettera"
      value={valore ?? ''}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">—</option>
      {LETTERE_CASSA.map((lettera) => (
        <option key={lettera} value={lettera}>
          {lettera}
        </option>
      ))}
    </select>
  );
}
