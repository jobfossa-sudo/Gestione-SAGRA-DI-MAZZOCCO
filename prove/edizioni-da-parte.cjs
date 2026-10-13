// Le prove che creano, azzerano o ricaricano un'edizione hanno bisogno di
// partire senza edizioni aperte: il sistema ne tiene una sola alla volta.
// Se sul computer ce n'è una (quella con cui si sta provando l'app a mano),
// la si mette da parte all'inizio e la si rimette identica alla fine. Si
// sposta solo il documento dell'edizione: serate, spese e presenze restano
// dove sono.

const EMULATORE = 'http://127.0.0.1:8080/v1';
const EDIZIONI = `${EMULATORE}/projects/gestione-sagra-mazzocco/databases/(default)/documents/edizioni`;
const PADRONE = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Le edizioni che ci sono adesso, come le restituisce l'emulatore. */
async function leggiEdizioni() {
  const risposta = await fetch(EDIZIONI, { headers: PADRONE });
  if (!risposta.ok) throw new Error(`Lettura delle edizioni: ${risposta.status} ${await risposta.text()}`);
  return (await risposta.json()).documents ?? [];
}

async function cancellaEdizioni() {
  for (const documento of await leggiEdizioni()) {
    await fetch(`${EMULATORE}/${documento.name}`, { method: 'DELETE', headers: PADRONE });
  }
}

/** Toglie le edizioni e restituisce quello che serve per rimetterle. */
async function mettiDaParteEdizioni() {
  const messe = await leggiEdizioni();
  await cancellaEdizioni();
  if (messe.length > 0) console.log(`(messa da parte l'edizione ${messe.map((d) => d.name.split('/').pop()).join(', ')}: torna alla fine)`);
  return messe;
}

/** Toglie quello che la prova ha lasciato e rimette le edizioni di prima. */
async function rimettiEdizioni(messe) {
  await cancellaEdizioni();
  for (const documento of messe) {
    const risposta = await fetch(`${EMULATORE}/${documento.name}`, {
      method: 'PATCH',
      headers: PADRONE,
      body: JSON.stringify({ fields: documento.fields }),
    });
    if (!risposta.ok) throw new Error(`Non riesco a rimettere ${documento.name}: ${risposta.status}`);
  }
  if (messe.length > 0) console.log('(edizione rimessa com’era)');
}

module.exports = { leggiEdizioni, cancellaEdizioni, mettiDaParteEdizioni, rimettiEdizioni };
