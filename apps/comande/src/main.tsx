import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { indirizzoApp } from '@sagra-mazzocco/shared'
import { registraApp } from '@sagra-mazzocco/shared/pwa'
import '../../../shared/styles/base.css'
import App from './App.tsx'
import { AvvisoAggiornamento } from './components/AvvisoAggiornamento'
import { segnalazioneDaIndirizzo } from './services/bagni'
import { menuDaIndirizzo } from './services/tavolo'

// Nell'app pubblicata il dispositivo si tiene una copia di tutto il sito, per
// aprirlo anche senza rete. Non per i clienti arrivati dal QR (menù dei tavoli,
// bagni): scaricherebbero l'app intera nel loro telefono per niente.
const cliente = menuDaIndirizzo().attivo || segnalazioneDaIndirizzo().attiva
if (import.meta.env.PROD && !cliente) registraApp(indirizzoApp('portale', false))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AvvisoAggiornamento />
  </StrictMode>,
)
