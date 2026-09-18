import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { startAutoSync } from './lib/sync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Synchro auto serveur maison (no-op tant qu'elle n'est pas configurée).
startAutoSync()

// Installation hors ligne (PWA) — uniquement sur la version compilée.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* file://, navigateur trop ancien… */
    })
  })
}