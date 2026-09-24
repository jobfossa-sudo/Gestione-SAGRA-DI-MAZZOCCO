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
    // La porta si può cambiare (PORTA_FIRESTORE=8085 …): così le prove si
    // possono lanciare su un emulatore a parte, senza spegnere e svuotare
    // quello con cui si sta provando l'app. Le prove finiscono con
    // clearFirestore(), che cancella tutto quello che trovano.
    firestore: { host: '127.0.0.1', port: Number(process.env.PORTA_FIRESTORE ?? 8080) },
  });

  // Dati di partenza scritti bypassando le regole (come farebbe una Cloud
  // Function con l'Admin SDK), per poter testare le LETTURE.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc('serate/2026-01-01').set({ data: '2026-01-01', aperta: true, contatoreOrdini: 1 });
    await db.doc('serate/2026-01-01/ordini/ordine1').set({ numero: 1, stato: 'bozza' });
    await db.doc('prodotti/panino').set({ nome: 'Panino', prezzo: 5 });
    await db.doc('categorie/secondi').set({ id: 'secondi', nome: 'Secondi', ordine: 10 });
    await db.doc('utenti/uid-cassa').set({ nomeUtente: 'cassa', amministratore: false, accessi: { comande: ['cassa'] } });
    await db.doc('utenti/uid-altro').set({ nomeUtente: 'altro', amministratore: false, accessi: { comande: ['cucina'] } });
    await db.doc('config/sistema').set({ amministratoreCreato: true });
    await db.doc('serate/2026-01-01/disponibilita/panino').set({ prodottoId: 'panino', porzioniMassime: 10, venduti: 4 });
    // I banchi: menù (scritto da chi ci lavora) e ordini (scritti solo dalle
    // Cloud Functions, come tutti gli altri ordini).
    await db.doc('banchi/bar/categorie/birre').set({ id: 'birre', nome: 'Birre', ordine: 0 });
    await db.doc('banchi/bar/prodotti/birra').set({ id: 'birra', categoriaId: 'birre', nome: 'Birra', prezzo: 3 });
    await db.doc('banchi/bevande/categorie/vini').set({ id: 'vini', nome: 'Vini', ordine: 0 });
    await db.doc('banchi/bevande/prodotti/vino').set({ id: 'vino', categoriaId: 'vini', nome: 'Vino', prezzo: 2 });
    await db.doc('serate/2026-01-01/ordiniBanco/scontrino1').set({ banco: 'bar', numero: 1, totale: 3, stato: 'incassato' });
  });

  const anonimo = testEnv.unauthenticatedContext().firestore();
  const senzaRuolo = testEnv.authenticatedContext('uid-senza-ruolo').firestore();
  const cassa = testEnv.authenticatedContext('uid-cassa', { comande: ['cassa'] }).firestore();
  const cucina = testEnv.authenticatedContext('uid-cucina', { comande: ['cucina'] }).firestore();
  const griglia = testEnv.authenticatedContext('uid-griglia', { comande: ['griglia'] }).firestore();
  const bar = testEnv.authenticatedContext('uid-bar', { comande: ['bar'] }).firestore();
  const distribuzione = testEnv.authenticatedContext('uid-distribuzione', { comande: ['distribuzione'] }).firestore();
  const bancoBar = testEnv.authenticatedContext('uid-banco-bar', { comande: ['bancoBar'] }).firestore();
  const bancoBevande = testEnv.authenticatedContext('uid-banco-bevande', { comande: ['bancoBevande'] }).firestore();
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

  // Portate del menù
  await check('chiunque legge le portate (servono al menu QR)', assertSucceeds(anonimo.collection('categorie').get()));
  await check('cassa non crea portate', assertFails(cassa.doc('categorie/nuova').set({ nome: 'Nuova', ordine: 99 })));
  await check('cassa non rinomina una portata', assertFails(cassa.doc('categorie/secondi').update({ nome: 'Altro' })));
  await check('cassa non elimina una portata', assertFails(cassa.doc('categorie/secondi').delete()));
  await check(
    'amministratore crea una portata',
    assertSucceeds(admin.doc('categorie/panini').set({ id: 'panini', nome: 'Panini', ordine: 50 }))
  );
  await check('amministratore rinomina una portata', assertSucceeds(admin.doc('categorie/secondi').update({ nome: 'Secondi piatti' })));

  // Componenti dei piatti: roba da personale, non da cliente
  await check(
    'amministratore crea un componente',
    assertSucceeds(admin.doc('componenti/pollo').set({ id: 'pollo', nome: 'Pollo', settore: 'griglia' }))
  );
  await check('la cucina legge i componenti', assertSucceeds(cucina.collection('componenti').get()));
  await check('il cliente dal QR non legge i componenti', assertFails(anonimo.collection('componenti').get()));
  await check('la cassa non modifica i componenti', assertFails(cassa.doc('componenti/pollo').update({ settore: 'bar' })));

  // Biglietti stampati e immagini: li compone l'amministratore, li legge chi
  // stampa.
  await check(
    'amministratore compone un biglietto',
    assertSucceeds(admin.doc('biglietti/resoconto').set({ id: 'resoconto', formato: 'a5-orizzontale', margineMm: 10, blocchi: [] }))
  );
  await check('la cassa legge l’impaginazione del biglietto', assertSucceeds(cassa.doc('biglietti/resoconto').get()));
  await check(
    'la distribuzione legge l’impaginazione del biglietto',
    assertSucceeds(distribuzione.doc('biglietti/resoconto').get())
  );
  await check('il cliente dal QR non legge i biglietti', assertFails(anonimo.doc('biglietti/resoconto').get()));
  await check('la cassa non cambia l’impaginazione', assertFails(cassa.doc('biglietti/resoconto').update({ margineMm: 0 })));
  await check(
    'amministratore carica un’immagine',
    assertSucceeds(admin.doc('immagini/logo').set({ id: 'logo', nome: 'logo', dati: 'data:image/png;base64,AAA', byte: 3 }))
  );
  await check('chi stampa legge le immagini', assertSucceeds(cassa.doc('immagini/logo').get()));
  await check('il cliente dal QR non legge le immagini', assertFails(anonimo.doc('immagini/logo').get()));
  await check('la cassa non carica immagini', assertFails(cassa.doc('immagini/logo').set({ id: 'logo' })));

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

  // I banchi: ognuno è padrone del proprio menù e di nessun altro
  await check(
    'il banco BAR modifica il proprio menù',
    assertSucceeds(bancoBar.doc('banchi/bar/prodotti/birra').update({ prezzo: 4 }))
  );
  await check(
    'il banco BAR crea un gruppo nel proprio menù',
    assertSucceeds(bancoBar.doc('banchi/bar/categorie/amari').set({ id: 'amari', nome: 'Amari', ordine: 10 }))
  );
  await check(
    'il banco BAR non tocca il menù di BEVANDE',
    assertFails(bancoBar.doc('banchi/bevande/prodotti/vino').update({ prezzo: 99 }))
  );
  await check(
    'il banco BEVANDE non tocca il menù del BAR',
    assertFails(bancoBevande.doc('banchi/bar/prodotti/birra').update({ prezzo: 99 }))
  );
  await check(
    'il banco BEVANDE modifica il proprio menù',
    assertSucceeds(bancoBevande.doc('banchi/bevande/prodotti/vino').update({ prezzo: 3 }))
  );
  await check(
    'la cassa non modifica il menù di un banco',
    assertFails(cassa.doc('banchi/bar/prodotti/birra').update({ prezzo: 0 }))
  );
  await check(
    'account senza ruolo non modifica il menù di un banco',
    assertFails(senzaRuolo.doc('banchi/bar/prodotti/birra').update({ prezzo: 0 }))
  );
  await check(
    'l’amministratore modifica il menù di un banco',
    assertSucceeds(admin.doc('banchi/bar/prodotti/birra').update({ prezzo: 3.5 }))
  );
  await check(
    'il menù di un banco non è pubblico come quello della sagra',
    assertFails(anonimo.collection('banchi/bar/prodotti').get())
  );
  await check(
    'il personale legge il menù di un banco',
    assertSucceeds(cassa.collection('banchi/bar/prodotti').get())
  );

  // Ordini dei banchi: si leggono, non si scrivono dal client
  await check(
    'il banco legge i propri ordini',
    assertSucceeds(bancoBar.collection('serate/2026-01-01/ordiniBanco').get())
  );
  await check(
    'il banco non scrive un ordine da solo',
    assertFails(bancoBar.doc('serate/2026-01-01/ordiniBanco/finto').set({ banco: 'bar', totale: 1000 }))
  );
  await check(
    'il banco non annulla un incasso scrivendo in archivio',
    assertFails(bancoBar.doc('serate/2026-01-01/ordiniBanco/scontrino1').update({ stato: 'annullato' }))
  );
  await check(
    'nemmeno l’amministratore scrive un ordine di banco a mano',
    assertFails(admin.doc('serate/2026-01-01/ordiniBanco/scontrino1').update({ totale: 0 }))
  );
  await check(
    'chi non è del personale non legge gli ordini dei banchi',
    assertFails(soloAltraApp.collection('serate/2026-01-01/ordiniBanco').get())
  );

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
