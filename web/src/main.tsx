import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Botón “Instalar app”: se guarda el aviso del navegador para usarlo cuando la persona lo pida
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); (window as unknown as { __instalar?: Event }).__instalar = e; window.dispatchEvent(new Event('gfm-instalable')) })

// App instalable y sin señal: solo en el sitio publicado (https), no en la vista previa ni en desarrollo
if ('serviceWorker' in navigator && import.meta.env.PROD && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* sin service worker */ }) })
}
