# Gestione Sagra di Mazzocco

Monorepo del sistema di gestione della sagra: le app (Comande, Contabilità,
Utenti, e in arrivo Magazzino) condividono un database Firestore e una logica
di business comune (Cloud Functions).

## Struttura

- `shared/` — tipi TypeScript e stili condivisi tra le app e le Cloud Functions
- `functions/` — Cloud Functions (logica di business condivisa)
- `apps/portale/` — il menù delle app: accesso unico e un riquadro per app, più i codici QR
- `apps/comande/` — ordini, reparti, distribuzione, banchi (arancione)
- `apps/contabilita/` — incassi, spese, presenze, report (verde petrolio)
- `apps/utenti/` — persone, ruoli, archivio delle edizioni (viola)
- `apps/magazzino/` — da fare (azzurro)

## Pubblicazione

Tutto su Firebase, sito compreso (Firebase Hosting):
https://gestione-sagra-mazzocco.web.app

`npm run build` dalla radice costruisce le app e le mette insieme in `dist/`
(il menù alla radice, le app in `/comande/`, `/contabilita/`, `/utenti/`).
Sotto lo stesso indirizzo l'accesso è uno solo.

Niente si pubblica da solo con il push su GitHub: si pubblica con

    firebase deploy --only hosting                 (solo il sito)
    firebase deploy --only hosting,firestore,functions   (tutto)

che ricostruisce il sito prima di caricarlo.

## App installabile

Il sito intero è una sola app installabile ("Sagra di Mazzocco"): menù,
Comande, Contabilità e Utenti dietro un'icona sola, a tutto schermo, e si
apre anche quando la rete cade. Pezzi:

- `apps/portale/public/manifest.webmanifest` — nome, colori, icone;
  le icone escono da `apps/portale/public/logo.svg` con `npm run icone`
  (dentro `apps/portale`)
- `/sw.js` — la copia di tutto il sito nel dispositivo, generata da
  `scripts/costruisci.mjs` alla fine della costruzione
- `shared/src/pwa.ts` — la registra (solo nel sito costruito, mai per i
  clienti arrivati dal QR), propone le versioni nuove con il tasto
  "Aggiorna" e offre l'installazione (riquadro in fondo al menù delle app)

In sviluppo l'app installabile non c'è (un'app per porta). Per provarla sul
computer senza toccare i dati veri, con il sistema di prova acceso:

    npm run prova:app      (costruisce dist-prova/ e lo apre su http://127.0.0.1:5190)

È costruita come quella vera ma lavora sugli emulatori.

## In locale

`Avvia in locale.bat` accende gli emulatori Firebase e le app, ognuna sulla sua
porta: menù 5170, Comande 5173, Utenti 5174, Contabilità 5175.
