import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Check, PenLine, ShieldCheck, X } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { Cargando, Aviso } from '../components/ui'
import { LogoFirme } from '../components/Logo'
import FotoActivo from '../components/FotoActivo'
import FirmaPad, { type FirmaPadRef } from '../components/FirmaPad'
import { blobADataURL } from '../components/Enlace'
import { fechaCorta } from '../components/Prestamo'

type Item = { codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; estado?: string | null; foto?: string | null }

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center justify-between"><LogoFirme className="h-8 w-auto text-[#fff]" /><span className="text-[10px] uppercase tracking-[.2em] text-marca">Control de activos</span></div>
        {children}
        <p className="mt-6 text-center text-[11px] text-stone-400">Grupo Empresarial Firme · Este enlace es personal y sirve una sola vez.</p>
      </div>
    </div>
  )
}
function Listo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="tarjeta animate-entrar p-8 text-center">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shadow-[0_0_40px_-8px_rgb(52_211_153/.7)]"><Check size={30} /></div>
      <h1 className="text-xl font-semibold">{titulo}</h1><p className="mt-2 text-sm text-stone-500">{texto}</p>
    </div>
  )
}
function ListaActivos({ items, marcar }: { items: Item[]; marcar?: { faltan: Set<string>; alternar: (c: string) => void } }) {
  return (
    <ul className="space-y-2">
      {items.map(a => {
        const falta = marcar?.faltan.has(a.codigo)
        return (
          <li key={a.codigo} className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${falta ? 'border-red-200 bg-red-50/50' : 'border-stone-200'}`}>
            <FotoActivo fotoModelo={a.foto} className="h-12 w-14 shrink-0 rounded-lg" icono={18} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px] text-marca">{a.codigo}</p>
              <p className="truncate text-sm">{[a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion}</p>
              <p className="truncate text-[11px] text-stone-500">{a.serie ? `S/N ${a.serie}` : a.descripcion}{a.estado ? ` · ${a.estado}` : ''}</p>
            </div>
            {marcar && (
              <div className="flex shrink-0 overflow-hidden rounded-lg border border-stone-300 text-xs">
                <button type="button" onClick={() => falta && marcar.alternar(a.codigo)} className={`px-2.5 py-1.5 ${!falta ? 'bg-emerald-50 text-emerald-700' : 'text-stone-500'}`}><Check size={13} className="inline" /> Lo tengo</button>
                <button type="button" onClick={() => !falta && marcar.alternar(a.codigo)} className={`border-l border-stone-300 px-2.5 py-1.5 ${falta ? 'bg-red-50 text-red-700' : 'text-stone-500'}`}><X size={13} className="inline" /> No</button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** /firmar/:token — firmar un resguardo desde el celular, sin cuenta. */
export function FirmaRemota() {
  const { token } = useParams()
  const [r, setR] = useState<{ folio: string; tipo: string; fecha: string; fecha_devolucion: string | null; empresa: string; recibe: string | null; entrega: string | null; notas: string | null; firmado: boolean; activos: Item[] } | null | undefined>(undefined)
  const [nombre, setNombre] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState('')
  const pad = useRef<FirmaPadRef>(null)
  useEffect(() => { supabase.rpc('resguardo_por_token', { p_token: token }).then(({ data }) => { setR((data as never) ?? null); setNombre((data as { recibe?: string } | null)?.recibe ?? '') }) }, [token])

  async function firmar() {
    setError('')
    if (pad.current?.vacio()) { setError('Firma en el recuadro.'); return }
    if (!acepto) { setError('Marca la casilla de aceptación.'); return }
    setEnviando(true)
    const b = await pad.current!.blob()
    const { data, error } = await supabase.rpc('firmar_resguardo', { p_token: token, p_firma: await blobADataURL(b!), p_nombre: nombre })
    setEnviando(false)
    if (error) setError(mensajeError(error)); else setHecho(data as string)
  }

  if (r === undefined) return <Marco><Cargando /></Marco>
  if (hecho) return <Marco><Listo titulo="¡Firmado!" texto={`Tu firma quedó en el resguardo ${hecho}. Ya puedes cerrar esta página.`} /></Marco>
  if (!r || r.firmado) return <Marco><Aviso>Este enlace ya se usó o no es válido. Pide uno nuevo a almacén.</Aviso></Marco>
  return (
    <Marco>
      <div className="space-y-4 animate-entrar">
        <div className="tarjeta p-5">
          <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><PenLine size={12} />Firma de resguardo · {r.folio}</p>
          <h1 className="text-xl font-semibold">Hola{r.recibe ? `, ${r.recibe.split(' ')[0]}` : ''}</h1>
          <p className="mt-1 text-sm text-stone-500">{r.empresa} te entrega {r.activos.length === 1 ? 'el siguiente activo' : `los siguientes ${r.activos.length} activos`} el {fechaCorta(r.fecha)}. Revisa y firma de recibido.</p>
        </div>
        <div className="tarjeta p-4"><ListaActivos items={r.activos} /></div>
        <div className="tarjeta space-y-4 p-5">
          <p className="text-sm text-stone-600">Me comprometo a usar estos activos solo para mi trabajo, cuidarlos, reportar cualquier daño, falla, pérdida o robo y devolverlos cuando la empresa lo solicite{r.fecha_devolucion ? <>, a más tardar el <b className="text-tinta">{fechaCorta(r.fecha_devolucion)}</b></> : ''}.</p>
          {r.notas && <p className="rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-500">Notas: {r.notas}</p>}
          <label className="block"><span className="etiqueta">Tu nombre completo</span><input className="campo" value={nombre} onChange={e => setNombre(e.target.value)} /></label>
          <FirmaPad ref={pad} titulo="Tu firma" />
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[#F9B234]" checked={acepto} onChange={e => setAcepto(e.target.checked)} />Recibí los activos descritos y acepto el resguardo.</label>
          {error && <Aviso>{error}</Aviso>}
          <button className="btn-primario w-full py-3" onClick={firmar} disabled={enviando}>{enviando ? 'Enviando…' : 'Firmar y aceptar'}</button>
        </div>
      </div>
    </Marco>
  )
}

/** /confirmar/:token — el empleado confirma que todavía tiene lo que está a su nombre. */
export function ConfirmacionRemota() {
  const { token } = useParams()
  const [c, setC] = useState<{ empleado: string; empresa: string; activos: Item[]; estatus: string } | null | undefined>(undefined)
  const [faltan, setFaltan] = useState<Set<string>>(new Set())
  const [comentario, setComentario] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)
  const pad = useRef<FirmaPadRef>(null)
  useEffect(() => { supabase.rpc('confirmacion_por_token', { p_token: token }).then(({ data }) => setC((data as never) ?? null)) }, [token])
  const alternar = (k: string) => setFaltan(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  async function enviar() {
    setError(''); setEnviando(true)
    const b = pad.current && !pad.current.vacio() ? await pad.current.blob() : null
    const { error } = await supabase.rpc('responder_confirmacion', { p_token: token, p_faltantes: [...faltan], p_comentario: comentario, p_firma: b ? await blobADataURL(b) : null })
    setEnviando(false)
    if (error) setError(mensajeError(error)); else setHecho(true)
  }

  if (c === undefined) return <Marco><Cargando /></Marco>
  if (hecho) return <Marco><Listo titulo="¡Gracias!" texto={faltan.size || comentario ? 'Registramos lo que reportaste; almacén se pondrá en contacto contigo.' : 'Confirmaste tu resguardo. Ya puedes cerrar esta página.'} /></Marco>
  if (!c || c.estatus !== 'pendiente') return <Marco><Aviso>Esta confirmación ya se respondió o el enlace no es válido.</Aviso></Marco>
  return (
    <Marco>
      <div className="space-y-4 animate-entrar">
        <div className="tarjeta p-5">
          <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[.16em] text-marca"><ShieldCheck size={12} />Confirmación de resguardo</p>
          <h1 className="text-xl font-semibold">Hola, {c.empleado.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-stone-500">Estos son los activos de {c.empresa} que tienes a tu nombre. Marca si todavía los tienes contigo.</p>
        </div>
        <div className="tarjeta p-4"><ListaActivos items={c.activos} marcar={{ faltan, alternar }} /></div>
        <div className="tarjeta space-y-4 p-5">
          <label className="block"><span className="etiqueta">¿Algo que comentar? (opcional)</span><textarea className="campo" rows={2} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ej. La laptop la tiene mi jefe de obra; el taladro se quedó en la obra GF-212." /></label>
          <FirmaPad ref={pad} titulo="Firma (opcional)" />
          {error && <Aviso>{error}</Aviso>}
          <button className="btn-primario w-full py-3" onClick={enviar} disabled={enviando}>
            {enviando ? 'Enviando…' : faltan.size ? `Enviar · ${faltan.size} no los tengo` : 'Confirmo que tengo todo'}
          </button>
        </div>
      </div>
    </Marco>
  )
}
