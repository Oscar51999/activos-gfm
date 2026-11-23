import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nfc, Smartphone, Trash2, Link2, CheckCircle2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { formasNfc, normalNfc, hayNfcCelular, leerConCelular, grabarEnlace } from '../lib/nfc'
import { urlQR } from '../lib/qr'
import { Aviso } from './ui'

/** Botón "Leer con el celular" (solo aparece en Chrome de Android con NFC). Mientras está activo, cada sticker que toques se lee. */
export function BotonNfcCelular({ onLeer, texto = 'Leer NFC con el celular', className = 'btn-sec' }: { onLeer: (uid: string, contenido: string | null) => void; texto?: string; className?: string }) {
  const [activo, setActivo] = useState(false)
  const [error, setError] = useState('')
  const cancelar = useRef<(() => void) | null>(null)
  const cb = useRef(onLeer); cb.current = onLeer
  useEffect(() => () => cancelar.current?.(), [])
  if (!hayNfcCelular()) return null
  function alternar() {
    if (activo) { cancelar.current?.(); cancelar.current = null; setActivo(false); return }
    setError(''); setActivo(true)
    cancelar.current = leerConCelular((uid, c) => { try { navigator.vibrate?.(40) } catch { /* */ } cb.current(uid, c) }, m => { setError(m); setActivo(false) })
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={`${className} ${activo ? '!border-marca !text-marca animate-pulse' : ''}`} onClick={alternar}><Smartphone size={16} />{activo ? 'Acerca el sticker al celular… (toca para parar)' : texto}</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

/** Busca qué activo tiene ligado este sticker (prueba todas las formas en que puede llegar el número). */
export async function activoPorNfc(t: string) {
  const formas = formasNfc(t)
  if (!formas.length) return null
  const { data } = await supabase.from('activos').select('id,codigo,descripcion,nfc_uid').in('nfc_uid', formas).limit(1).maybeSingle()
  return data as { id: string; codigo: string; descripcion: string; nfc_uid: string } | null
}

/** Asigna un sticker a un activo. Regresa un mensaje de error o null si quedó. */
export async function ligarNfc(activoId: string, lectura: string): Promise<{ error: string | null; uid?: string; otro?: { id: string; codigo: string } }> {
  const uid = normalNfc(lectura)
  if (uid.length < 6) return { error: 'Eso no parece el número de un sticker NFC. Acerca el sticker al lector otra vez.' }
  const ya = await activoPorNfc(uid)
  if (ya && ya.id !== activoId) return { error: `Ese sticker ya está ligado a ${ya.codigo} · ${ya.descripcion}.`, otro: ya }
  const { error } = await supabase.from('activos').update({ nfc_uid: uid }).eq('id', activoId)
  return error ? { error: mensajeError(error) } : { error: null, uid }
}

/** Panel para ligar / cambiar / quitar el sticker NFC de un activo. */
export function LigarNfc({ activo, onCambio }: { activo: { id: string; codigo: string; qr?: string | null; nfc_uid?: string | null }; onCambio: (uid: string | null) => void }) {
  const [texto, setTexto] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error' | 'info'; t: string; otro?: { id: string; codigo: string } } | null>(null)
  const [grabando, setGrabando] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { setTimeout(() => input.current?.focus(), 80) }, [])

  async function ligar(valor: string) {
    if (!valor.trim()) return
    const r = await ligarNfc(activo.id, valor)
    setTexto('')
    if (r.error) { setMsg({ tipo: 'error', t: r.error, otro: r.otro }); return }
    setMsg({ tipo: 'ok', t: `Sticker ${r.uid} ligado a ${activo.codigo}.` }); onCambio(r.uid!)
  }
  async function quitar() {
    const { error } = await supabase.from('activos').update({ nfc_uid: null }).eq('id', activo.id)
    if (error) { setMsg({ tipo: 'error', t: mensajeError(error) }); return }
    setMsg({ tipo: 'info', t: 'Se quitó el sticker de este activo.' }); onCambio(null)
  }
  async function grabar() {
    if (!activo.qr) return
    setGrabando(true); setMsg({ tipo: 'info', t: 'Acerca el sticker al celular para grabarle el enlace…' })
    try { await grabarEnlace(urlQR(activo.qr)); setMsg({ tipo: 'ok', t: 'Listo: cualquier celular que toque el sticker abrirá la ficha de este activo.' }) }
    catch (e) { setMsg({ tipo: 'error', t: (e as Error).name === 'NotAllowedError' ? 'Da permiso de NFC al navegador.' : 'No se pudo grabar. Algunos stickers vienen bloqueados contra escritura; aun así sirven para leerlos.' }) }
    setGrabando(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
        <Nfc size={22} className="text-marca" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-stone-500">Sticker ligado</p>
          <p className="break-all font-mono text-sm">{activo.nfc_uid ?? 'Ninguno todavía'}</p>
        </div>
        {activo.nfc_uid && <button type="button" className="btn-sec !px-3 !py-1.5 text-xs hover:!text-red-700" onClick={quitar}><Trash2 size={14} />Quitar</button>}
      </div>
      <form onSubmit={e => { e.preventDefault(); ligar(texto) }} className="space-y-2">
        <label className="block text-sm font-medium">Con el lector USB: deja el cursor aquí y acerca el sticker</label>
        <div className="flex gap-2">
          <input ref={input} className="campo font-mono" placeholder="El número del sticker aparece solo…" value={texto} onChange={e => setTexto(e.target.value)} autoComplete="off" />
          <button className="btn-primario">{activo.nfc_uid ? 'Cambiar' : 'Ligar'}</button>
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        <BotonNfcCelular onLeer={uid => ligar(uid)} texto="Ligar con el celular" />
        {hayNfcCelular() && activo.qr && <button type="button" className="btn-sec" disabled={grabando} onClick={grabar}><Link2 size={16} />Grabar enlace en el sticker</button>}
      </div>
      {msg && (msg.tipo === 'ok'
        ? <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700"><CheckCircle2 size={16} />{msg.t}</p>
        : <Aviso tipo={msg.tipo === 'error' ? 'error' : 'info'}>{msg.t}{msg.otro && <> <Link className="underline" to={`/activos/${msg.otro.id}`}>Ver {msg.otro.codigo}</Link></>}</Aviso>)}
      <p className="text-[11px] text-stone-400">El lector NFC funciona como teclado: escribe el número del chip y da Enter. Si tu lector no da Enter, presiona “Ligar”. En Android también puedes usar el NFC del propio celular (Chrome).</p>
    </div>
  )
}
