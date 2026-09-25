import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { startAutoCloudSync } from './lib/cloudSync'
import { AuthProvider } from './lib/auth'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </StrictMode>,
)

// Synchro cloud Supabase (no-op sans config ou sans compte connecté).
startAutoCloudSync()

// Bibliothèque unique : base illustrée téléchargée une fois en arrière-plan.
import('./store/store').then(({ useStore }) => {
  const run = () => void useStore.getState().ensureIllustratedLibrary().catch(() => {})
  if (document.readyState === 'complete') setTimeout(run, 3000)
  else window.addEventListener('load', () => setTimeout(run, 3000))
})

// Installation hors ligne (PWA) — uniquement sur la version compilée.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* file://, navigateur trop ancien… */
    })
  })
}
