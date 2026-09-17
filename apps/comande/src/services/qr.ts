import QRCode from 'qrcode';

/** Un QR come immagine vettoriale (nitida in stampa). Il disegno richiede un
 * attimo: chi stampa deve aspettarlo, altrimenti il foglio esce senza il
 * quadrato. */
export function creaQrSvg(indirizzo: string): Promise<string> {
  return QRCode.toString(indirizzo, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
}
