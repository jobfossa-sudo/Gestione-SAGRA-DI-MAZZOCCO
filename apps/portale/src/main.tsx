import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { indirizzoApp } from '@sagra-mazzocco/shared'
import { registraApp } from '@sagra-mazzocco/shared/pwa'
import '../../../shared/styles/base.css'
import './App.css'
import App from './App.tsx'
import { AvvisoAggiornamento } from './components/AvvisoAggiornamento'

// Nell'app pubblicata il dispositivo si tiene una copia di tutto il sito, per
// aprirlo anche senza rete.
if (import.meta.env.PROD) registraApp(indirizzoApp('portale', false))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <AvvisoAggiornamento />
  </StrictMode>,
)
