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

Un solo sito Netlify per tutte le app: `npm run build` dalla radice costruisce le
app e le mette insieme in `dist/` (il menù alla radice, le app in `/comande/`,
`/contabilita/`, `/utenti/`). Sotto lo stesso indirizzo l'accesso è uno solo.
Su Netlify la "Base directory" resta vuota: le impostazioni sono in `netlify.toml`.

## In locale

`Avvia in locale.bat` accende gli emulatori Firebase e le app, ognuna sulla sua
porta: menù 5170, Comande 5173, Utenti 5174, Contabilità 5175.
