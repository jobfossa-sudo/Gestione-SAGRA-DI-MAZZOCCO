// Usato da "Avvia in locale.bat": aspetta che gli emulatori siano pronti e poi
// carica i dati di prova (seed.js). Gli emulatori non conservano nulla tra un
// avvio e l'altro, quindi i dati vanno ricaricati ogni volta.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const HUB = 'http://127.0.0.1:4400/emulators';
const ATTESA_MASSIMA_MS = 3 * 60 * 1000;

async function emulatoriPronti() {
  try {
    const risposta = await fetch(HUB);
    if (!risposta.ok) return false;
    const elenco = await risposta.json();
    return ['firestore', 'auth', 'functions'].every((nome) => elenco[nome]);
  } catch {
    return false;
  }
}

async function main() {
  const inizio = Date.now();
  process.stdout.write('Aspetto che Firebase locale sia pronto');
  while (!(await emulatoriPronti())) {
    if (Date.now() - inizio > ATTESA_MASSIMA_MS) {
      console.error('\nFirebase locale non è partito: guarda la finestra "Firebase locale" per l\'errore.');
      process.exit(1);
    }
    process.stdout.write('.');
    await new Promise((fatto) => setTimeout(fatto, 2000));
  }
  console.log(' pronto.');
  execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit' });
}

main();
