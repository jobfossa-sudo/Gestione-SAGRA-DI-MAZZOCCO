import QRCode from 'qrcode';
import { indirizzoTavolo } from './tavolo';

/** Il QR di un tavolo come immagine vettoriale (nitida in stampa). Il disegno
 * richiede un attimo: chi stampa deve aspettarlo, altrimenti il foglio esce
 * senza il quadrato. */
export function creaQrSvg(tavolo: number): Promise<string> {
  return QRCode.toString(indirizzoTavolo(tavolo), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
}
