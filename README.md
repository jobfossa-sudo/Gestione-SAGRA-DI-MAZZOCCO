# Gestione Sagra di Mazzocco

Monorepo del sistema di gestione della sagra: tre app (Comande, Magazzino,
Contabilità) che condividono un database Firestore e una logica di business
comune (Cloud Functions).

## Struttura

- `shared/` — tipi TypeScript condivisi tra le app e le Cloud Functions
- `functions/` — Cloud Functions (logica di business condivisa)
- `apps/comande/` — app di gestione ordini (in sviluppo)
- `apps/magazzino/` — app di gestione magazzino (da fare)
- `apps/contabilita/` — app di contabilità (da fare)

Ogni app in `apps/` viene pubblicata come sito Netlify separato, puntato alla
propria sottocartella.
