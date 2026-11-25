import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

/** Si una pantalla truena, muestra un aviso con salida en vez de dejar la página en blanco. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[GFM] Error de pantalla:', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto my-10 max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 text-red-600" size={32} />
        <p className="text-lg font-semibold text-red-800">Algo salió mal en esta pantalla</p>
        <p className="mt-1 text-sm text-red-700">Tus datos están a salvo. Recarga la página; si se repite, avisa al Departamento de TICS.</p>
        <p className="mt-3 break-words font-mono text-[11px] text-red-500">{this.state.error.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-primario" onClick={() => location.reload()}><RotateCcw size={15} />Recargar</button>
          <button className="btn-sec" onClick={() => { this.setState({ error: null }); location.hash = '#/' }}><Home size={15} />Ir al inicio</button>
        </div>
      </div>
    )
  }
}
