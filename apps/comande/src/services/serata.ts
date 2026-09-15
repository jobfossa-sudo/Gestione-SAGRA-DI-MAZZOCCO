// Per ora si lavora sempre sulla serata di oggi: non esiste ancora
// un'interfaccia per aprire/chiudere le serate (fuori dallo scope dello
// Step 3), quindi si usa la stessa convenzione già usata dallo script di
// seed per generare l'id della serata.
export const SERATA_ID_OGGI = new Date().toISOString().slice(0, 10);
