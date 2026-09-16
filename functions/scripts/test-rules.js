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

  // Dati di partenza scritti bypassando le regole (come farebbe una Cloud
  // Function con l'Admin SDK), per poter testare le LETTURE.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('serate/2026-01-01').set({ data: '2026-01-01', aperta: true, contatoreOrdini: 1 });
    await db.doc('serate/2026-01-01/ordini/ordine1').set({ numero: 1, stato: 'bozza' });
    await db.doc('prodotti/panino').set({ nome: 'Panino', prezzo: 5 });
    await db.doc('utenti/uid-cassa').set({ nomeUtente: 'cassa', amministratore: false, accessi: { comande: ['cassa'] } });
    await db.doc('utenti/uid-altro').set({ nomeUtente: 'altro', amministratore: false, accessi: { comande: ['cucina'] } });
    await db.doc('config/sistema').set({ amministratoreCreato: true });
    await db.doc('serate/2026-01-01/disponibilita/panino').set({ prodottoId: 'panino', porzioniMassime: 10, venduti: 4 });
  });

  const anonimo = testEnv.unauthenticatedContext().firestore();
  const senzaRuolo = testEnv.authenticatedContext('uid-senza-ruolo').firestore();
  const cassa = testEnv.authenticatedContext('uid-cassa', { comande: ['cassa'] }).firestore();
  const cucina = testEnv.authenticatedContext('uid-cucina', { comande: ['cucina'] }).firestore();
  const griglia = testEnv.authenticatedContext('uid-griglia', { comande: ['griglia'] }).firestore();
  const bar = testEnv.authenticatedContext('uid-bar', { comande: ['bar'] }).firestore();
  const admin = testEnv.authenticatedContext('uid-admin', { amministratore: true }).firestore();
  // Accesso a un'altra app soltanto: non deve vedere nulla di Comande.
  const soloAltraApp = testEnv.authenticatedContext('uid-contabile', { contabilita: ['visione'] }).firestore();

  const esiti = [];

  // assertSucceeds/assertFails si risolvono quando l'esito è quello atteso e
  // vengono rifiutate altrimenti: basta un solo helper per entrambi i casi.
  function check(nome, promise) {
    return promise.then(
      () => esiti.push({ nome, ok: true }),
      () => esiti.push({ nome, ok: false })
    );
  }

  // Menu
  await check('chiunque legge il menu (serve alla pagina QR)', assertSucceeds(anonimo.collection('prodotti').get()));
  await check('anonimo non modifica il menu', assertFails(anonimo.doc('prodotti/panino').update({ prezzo: 0 })));
  await check('account senza ruolo non modifica il menu', assertFails(senzaRuolo.doc('prodotti/panino').update({ prezzo: 0 })));
  await check('cassa non modifica il menu', assertFails(cassa.doc('prodotti/panino').update({ prezzo: 0 })));
  await check('amministratore modifica il menu', assertSucceeds(admin.doc('prodotti/panino').update({ prezzo: 6 })));

  // Ordini
  await check('anonimo non legge gli ordini', assertFails(anonimo.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('account senza ruolo non legge gli ordini', assertFails(senzaRuolo.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('cassa legge gli ordini', assertSucceeds(cassa.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('cucina legge gli ordini', assertSucceeds(cucina.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('griglia legge gli ordini', assertSucceeds(griglia.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check('bar legge gli ordini', assertSucceeds(bar.doc('serate/2026-01-01/ordini/ordine1').get()));
  await check(
    'chi ha accesso solo a un’altra app non legge gli ordini di Comande',
    assertFails(soloAltraApp.doc('serate/2026-01-01/ordini/ordine1').get())
  );
  await check(
    'nemmeno l’amministratore scrive direttamente un ordine (solo tramite Cloud Functions)',
    assertFails(admin.doc('serate/2026-01-01/ordini/ordine1').update({ stato: 'completata' }))
  );

  // Porzioni: i numeri sono riservati al personale
  await check(
    'il personale legge le porzioni rimaste',
    assertSucceeds(cassa.doc('serate/2026-01-01/disponibilita/panino').get())
  );
  await check(
    'il cliente dal QR non vede quante porzioni restano',
    assertFails(anonimo.doc('serate/2026-01-01/disponibilita/panino').get())
  );
  await check(
    'nessuno può ritoccare le porzioni vendute a mano',
    assertFails(admin.doc('serate/2026-01-01/disponibilita/panino').update({ venduti: 0 }))
  );

  // Utenti
  await check('un utente legge il proprio profilo', assertSucceeds(cassa.doc('utenti/uid-cassa').get()));
  await check('un utente non legge il profilo di un altro', assertFails(cassa.doc('utenti/uid-altro').get()));
  await check('amministratore legge tutti i profili', assertSucceeds(admin.collection('utenti').get()));
  await check('nessuno si modifica il ruolo da solo', assertFails(cassa.doc('utenti/uid-cassa').update({ amministratore: true })));

  // Configurazione di sistema
  await check('nemmeno l’amministratore legge la configurazione interna', assertFails(admin.doc('config/sistema').get()));

  // I dati finti usati qui non devono influenzare gli script eseguiti dopo
  // sullo stesso emulatore (es. config/sistema bloccherebbe inizializzaSistema).
  await testEnv.clearFirestore();
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
  console.log(`\nTutti i ${esiti.length} test sono passati.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
