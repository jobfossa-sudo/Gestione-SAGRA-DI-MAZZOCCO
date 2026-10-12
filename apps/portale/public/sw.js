// Questo file c'è solo per i telefoni e i computer che avevano già aperto il
// sito quando all'indirizzo principale c'era l'app Comande, installata per
// funzionare senza rete. Quella copia, rimasta nel browser, continuerebbe a
// mostrare la vecchia Comande al posto del menù delle app. Il browser cerca
// gli aggiornamenti proprio qui (/sw.js): trova questo, che si cancella da solo
// e ricarica le pagine aperte. Comande ora ha la sua copia in /comande/.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      await self.registration.unregister();
      for (const nome of await caches.keys()) await caches.delete(nome);
      for (const finestra of await self.clients.matchAll({ type: 'window' })) finestra.navigate(finestra.url);
    })()
  );
});
