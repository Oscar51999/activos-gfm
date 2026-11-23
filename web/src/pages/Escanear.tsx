import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'
import { leerQR, esEPC, leerPosicion } from '../lib/qr'
import { Encabezado, Aviso } from '../components/ui'
import { BotonNfcCelular, activoPorNfc, esIphone } from '../components/Nfc'

const parar = (l: Html5Qrcode, luego: () => void) => { try { l.stop().catch(() => {}).finally(luego) } catch { luego() } }

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
      const pos = leerPosicion(texto)
      if (pos && !detenido) { detenido = true; parar(lector, () => nav(`/posiciones?pos=${pos}`)); return }
      const qr = leerQR(texto)
      if (qr && !detenido) { detenido = true; parar(lector, () => nav(`/q/${qr}`)) }
    }, () => {}).catch(() => setError('No se pudo abrir la cámara. Revisa el permiso del navegador o busca por código abajo.'))
    return () => { if (!detenido) try { lector.stop().catch(() => {}) } catch { /* la cámara nunca arrancó */ } }
  }, [nav])

  async function buscar(e?: React.FormEvent, valor = codigo) {
    e?.preventDefault()
    const pos = leerPosicion(valor)
    if (pos) { nav(`/posiciones?pos=${pos}`); return }
    const qr = leerQR(valor)
    if (qr) { nav(`/q/${qr}`); return }
    const t = valor.replace(/[,()"]/g, '').trim().toUpperCase()
    if (!t) return
    const nfc = await activoPorNfc(t)
    if (nfc) { nav(`/activos/${nfc.id}`); return }
    const { data } = esEPC(t) ? await supabase.from('activos').select('id').eq('rfid_epc', t).limit(1).maybeSingle()
      : await supabase.from('activos').select('id').or(`codigo.eq.${t},numero_economico.eq.${t},serie.eq.${t},rfid_epc.eq.${t}`).limit(1).maybeSingle()
    if (data) nav(`/activos/${data.id}`)
    else setError(`No se encontró un activo con "${t}". Si es un sticker NFC nuevo, lígalo desde la ficha del activo o en Etiquetas NFC.`)
  }

  return (
    <div className="mx-auto max-w-md">
      <Encabezado titulo="Escanear QR" sub="Apunta la cámara a la etiqueta QR, o usa el lector NFC, RFID o de código de barras en el campo de abajo." />
      <div id="lector-qr" className="tarjeta overflow-hidden" />
      {error && <div className="mt-4"><Aviso>{error}</Aviso></div>}
      <form onSubmit={buscar} className="mt-6 flex gap-2">
        <input autoFocus className="campo" placeholder="Acerca el sticker NFC al lector, o escribe código, No. económico o serie" value={codigo} onChange={e => setCodigo(e.target.value)} />
        <button className="btn-primario">Buscar</button>
      </form>
      {esIphone() && <div className="mt-4 rounded-xl border border-marca/30 bg-marca/10 p-3 text-sm">
        <p className="font-medium">¿Sticker NFC con iPhone?</p>
        <p className="mt-1 text-xs text-stone-500">La cámara no lee el sticker. Sal de esta pantalla y acerca la <b>parte de arriba</b> del iPhone al sticker: aparecerá un aviso para abrir la ficha. Funciona si el sticker tiene grabado su enlace (en la ficha del activo → “Sticker NFC” está el enlace y cómo grabarlo).</p>
      </div>}
      <div className="mt-3"><BotonNfcCelular onLeer={(uid, contenido) => { setCodigo(uid); buscar(undefined, contenido && leerQR(contenido) ? contenido : uid) }} /></div>
    </div>
  )
}
