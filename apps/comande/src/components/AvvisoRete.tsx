import { useEffect, useState } from 'react';

/** Senza collegamento l'app continua a mostrare quello che ha già (menù,
 * pannelli, elenchi), ma non può battere ordini: le scritture passano dal
 * server. Meglio dirlo subito e in grande, invece di far premere un tasto che
 * non funziona. */
export function AvvisoRete() {
  const [collegato, setCollegato] = useState(navigator.onLine);

  useEffect(() => {
    const online = () => setCollegato(true);
    const offline = () => setCollegato(false);
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  if (collegato) return null;

  return (
    <p className="avviso-rete" role="status">
      Senza collegamento: quello che vedi è l'ultimo aggiornamento ricevuto. Gli ordini non partono finché la rete
      non torna.
    </p>
  );
}
