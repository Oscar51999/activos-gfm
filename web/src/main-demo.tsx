import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { instalarDemo } from './demo/mock'

// La vista previa corre en un marco que no muestra diálogos del navegador.
window.confirm = () => true
window.prompt = (m?: string) => (m?.toLowerCase().includes('modelo') ? 'Modelo de prueba' : 'Marca de prueba')

instalarDemo('https://vbdpackixppvnujcwrog.supabase.co')

import('./App').then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <div className="no-print pointer-events-none fixed bottom-24 left-1/2 z-[60] w-max max-w-[92vw] -translate-x-1/2 rounded-full border border-marca/40 bg-black/80 px-4 py-1.5 text-center text-[11px] text-marca shadow-lg backdrop-blur lg:bottom-3">
        <span className="lg:hidden">Vista previa · datos de ejemplo</span><span className="hidden lg:inline">Vista previa con datos de ejemplo · los cambios no se guardan · imprimir y cámara no funcionan aquí</span>
      </div>
    </StrictMode>,
  )
})
