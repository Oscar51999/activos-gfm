import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { leerQR } from '../lib/qr'
import { Encabezado, Aviso } from '../components/ui'

export default function Escanear() {
  const nav = useNavigate()
  const ref = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState('')
  const [codigo, setCodigo] = useState('')

  useEffect(() => {
    const lector = new Html5Qrcode('lector-qr')
    ref.current = lector
    let detenido = false
    lector.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, texto => {
      const qr = leerQR(texto)
      if (qr && !detenido) { detenido = true; lector.stop().catch(() => {}).finally(() => nav(`/q/${qr}`)) }
    }, () => {}).catch(() => setError('No se pudo abrir la cámara. Revisa el permiso del navegador o busca por código abajo.'))
    return () => { if (!detenido) lector.stop().catch(() => {}) }
  }, [nav])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const t = codigo.replace(/[,()"]/g, '').trim().toUpperCase()
    if (!t) return
    const { data } = await supabase.from('activos').select('id').or(`codigo.eq.${t},numero_economico.eq.${t},serie.eq.${t}`).limit(1).maybeSingle()
    if (data) nav(`/activos/${data.id}`)
    else setError(`No se encontró un activo con "${t}".`)
  }

  return (
    <div className="mx-auto max-w-md">
      <Encabezado titulo="Escanear QR" sub="Apunta la cámara a la etiqueta del activo." />
      <div id="lector-qr" className="tarjeta overflow-hidden" />
      {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
      <form onSubmit={buscar} className="mt-6 flex gap-2">
        <input className="campo" placeholder="O escribe el código, No. económico o serie" value={codigo} onChange={e => setCodigo(e.target.value)} />
        <button className="btn-primario">Buscar</button>
      </form>
    </div>
  )
}
