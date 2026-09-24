# Prove nel browser

Queste prove guidano un browser vero sulle app, come farebbe una persona:
battono ordini, stampano (la stampa viene catturata invece di finire sulla
carta), leggono codici a barre e ordinano dal QR.

## Come si lanciano

1. Accendi il sistema di prova: doppio clic su `Avvia in locale.bat` nella
   cartella principale.
2. La prima volta, qui dentro: `npm install` e poi
   `npx playwright install chromium`.
3. `npm run prova` (oppure un file alla volta, es. `node prova-cassa.cjs`).

Schermate e fogli catturati finiscono in `prove/risultati/`, che non viene
salvata su GitHub.

## Cosa provano

- `prova-cassa.cjs` — conferma, stampa del foglio per il cliente, incasso,
  invio ai reparti, annullamento, ordine dal QR richiamato in cassa.
- `prova-distribuzione.cjs` — stampa automatica della copia cucina, Ristampa,
  nessun doppione con due postazioni, lettura del codice a barre e messaggi
  di errore.
- `prova-qr.cjs` — il menù del cliente dal QR del tavolo e la generazione dei
  QR da parte dell'amministratore.
- `prova-biglietti.cjs` — la composizione dei biglietti: blocchi accesi,
  spenti e trascinati, immagini, carta e stampa di prova.
- `prova-banchi.cjs` — i banchi BAR e BEVANDE: il menù che si gestiscono da
  soli, l'incasso con lo scontrino, l'archivio con ristampa e annullamento, le
  comande del bere che arrivano a BEVANDE dalla cassa dei tavoli e gli incassi
  dei banchi dentro il totale di Fine serata.
- `prova-offline.cjs` — cosa si vede quando la rete cade.
- `prova-carattere.cjs` — i tasti che rimpiccioliscono e ingrandiscono le
  scritte: in Comande, sul telefono del cliente e nell'app Utenti. Controlla
  anche che il biglietto da stampare resti della sua misura.

Le prove del server (senza browser) stanno invece in `functions/scripts/`:
`test-rules.js` e `test-functions.js`.
