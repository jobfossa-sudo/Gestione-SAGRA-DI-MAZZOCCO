import { idSerata } from '@sagra-mazzocco/shared';

// Per ora si lavora sempre sulla serata in corso: non esiste ancora
// un'interfaccia per aprire e chiudere le serate a mano.
//
// Quale sia "la serata in corso" lo decide idSerata(), che tiene conto del
// fatto che una sagra sborda oltre la mezzanotte: fino alle due di notte si
// sta ancora nella serata di ieri.
export const SERATA_ID_OGGI = idSerata();
