// Questo file c'è solo per i telefoni e i computer che avevano già aperto
// Comande quando era installabile per conto suo, con la sua copia in /comande/.
// Ora l'app installabile è una sola, tutto il sito, con la copia in /sw.js.
// Il browser cerca gli aggiornamenti della vecchia copia proprio qui: trova
// questo, che si cancella da solo e ricarica le pagine aperte, così le prende
// in mano la copia di tutto il sito.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      await self.registration.unregister();
      for (const nome of await caches.keys()) {
        // Le copie del sito intero restano: sono di /sw.js, non di questa.
        if (nome.includes('/comande/')) await caches.delete(nome);
      }
      for (const finestra of await self.clients.matchAll({ type: 'window' })) finestra.navigate(finestra.url);
    })()
  );
});
