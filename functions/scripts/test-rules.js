// Verifica che le regole di sicurezza di Firestore si comportino come
// previsto. Va eseguito MENTRE l'emulatore Firestore è avviato:
//
//   firebase emulators:exec --only firestore "node functions/scripts/test-rules.js"
//
// Non tocca mai il database reale (solo l'emulatore locale).

const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'gestione-sagra-mazzocco',
    firestore: { host: '127.0.0.1', port: 8080 },
  });

  // Prepara un ordine di esempio bypassando le regole (come farebbe una
  // Cloud Function con l'Admin SDK), per poter testare la LETTURA.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('serate/2026-01-01').set({ data: '2026-01-01', aperta: true, contatoreOrdini: 1 });
    await db.doc('serate/2026-01-01/ordini/ordine1').set({ numero: 1, stato: 'bozza' });
  });

  const anonimo = testEnv.unauthenticatedContext().firestore();
  const staff = testEnv.authenticatedContext('utente-staff-1').firestore();

  let esiti = [];

  // assertSucceeds/assertFails restituiscono già una promise che si risolve
  // quando l'esito è quello atteso, e viene rifiutata quando non lo è: basta
  // un solo helper per entrambi i casi.
  function check(nome, promise) {
    return promise.then(
      () => esiti.push({ nome, ok: true }),
      () => esiti.push({ nome, ok: false })
    );
  }

  await check('lettura pubblica prodotti (menu)', assertSucceeds(anonimo.collection('prodotti').get()));
  await check('scrittura non autenticata su prodotti viene negata', assertFails(anonimo.doc('prodotti/test').set({ nome: 'x' })));
  await check(
    'scrittura non autenticata diretta su un ordine viene negata',
    assertFails(anonimo.doc('serate/2026-01-01/ordini/ordine1').update({ stato: 'completata' }))
  );
  await check(
    'scrittura autenticata diretta su un ordine viene negata (deve passare SOLO dalle Cloud Functions)',
    assertFails(staff.doc('serate/2026-01-01/ordini/ordine1').update({ stato: 'completata' }))
  );
  await check('lettura autenticata di un ordine riesce', assertSucceeds(staff.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('lettura non autenticata di un ordine viene negata', assertFails(anonimo.doc('serate/2026-01-01/ordini/ordine1').get()));

  await testEnv.cleanup();

  console.log('\nRisultati test regole di sicurezza:');
  let tuttiOk = true;
  for (const e of esiti) {
    console.log(`  ${e.ok ? 'OK ' : 'FALLITO'} - ${e.nome}`);
    if (!e.ok) tuttiOk = false;
  }

  if (!tuttiOk) {
    console.error('\nAlcuni test sono falliti.');
    process.exit(1);
  }
  console.log('\nTutti i test sono passati.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
