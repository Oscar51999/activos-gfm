import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, PlugZap, CheckCircle2, AlertTriangle, Send, Eye, Copy, CalendarClock, Users } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { MODULOS, nombreModulo, type Pendientes } from '../lib/avisos'
import { Encabezado, Cargando, Aviso, Campo, Vacio } from '../components/ui'
import codigo from '../lib/avisosCodigo.gs.txt?raw'

type Estado = { url: boolean; secreto: boolean; ultimo: string | null; programado: boolean }
type Usr = { id: string; nombre: string; email: string | null; avisos_correo: string | null; avisos: string[]; avisos_activos: boolean; activo: boolean }

/** Configuración de los avisos por correo: conectar el Apps Script, ver qué le llega a cada quien y mandar una prueba. */
export default function Avisos() {
  const { esAdmin, perfil } = useAuth()
  const [est, setEst] = useState<Estado | null>(null)
  const [usrs, setUsrs] = useState<Usr[]>([])
  const [f, setF] = useState({ url: '', secreto: '' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [quien, setQuien] = useState('')
  const [previa, setPrevia] = useState<Pendientes | null | undefined>(undefined)
  const [copiado, setCopiado] = useState(false)

  const cargar = () => {
    supabase.rpc('avisos_estado').then(({ data, error }) => { if (error) setMsg({ ok: false, t: mensajeError(error) }); else setEst(data as Estado) })
    supabase.from('perfiles').select('id,nombre,email,avisos_correo,avisos,avisos_activos,activo').eq('activo', true).order('nombre').then(({ data }) => setUsrs((data as Usr[]) ?? []))
  }
  useEffect(cargar, [])
  useEffect(() => { if (!quien && perfil) setQuien(perfil.id) }, [perfil, quien])
  useEffect(() => {
    if (!quien) return
    setPrevia(undefined)
    supabase.rpc('avisos_vista_previa', { p_perfil: quien }).then(({ data }) => setPrevia((data as Pendientes) ?? null))
  }, [quien])

  if (!esAdmin) return <div className="tarjeta"><Vacio titulo="Solo administradores" texto="Pide al administrador que configure los avisos por correo." /></div>
  if (!est) return msg ? <Aviso>{msg.t}</Aviso> : <Cargando />
  const conectado = est.url && est.secreto

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error } = await supabase.rpc('avisos_configurar', { p_url: f.url || null, p_secreto: f.secreto || null })
    if (error) { setMsg({ ok: false, t: mensajeError(error) }); return }
    setF({ url: '', secreto: '' }); setMsg({ ok: true, t: 'Guardado. Ahora manda una prueba para confirmar que llega.' }); cargar()
  }
  async function probar(todos: boolean) {
    setMsg(null)
    const { data, error } = await supabase.rpc('avisos_enviar_ahora', { p_perfil: todos ? null : quien })
    if (error) { setMsg({ ok: false, t: mensajeError(error) }); return }
    setMsg({ ok: true, t: todos ? `Se mandaron ${data} correo(s) con pendientes.` : `Prueba enviada a ${usrs.find(u => u.id === quien)?.avisos_correo || usrs.find(u => u.id === quien)?.email}. Revisa la bandeja (y Spam).` })
    cargar()
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(codigo); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch { /* sin portapapeles */ }
  }

  const porModulo = MODULOS.map(m => ({ ...m, quienes: usrs.filter(u => u.avisos?.includes(m.id)) }))

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Avisos por correo" sub="Cada mañana (7:30 a.m.) le llega a cada quien un correo con lo pendiente de los temas que atiende. Robo, extravío y equipo fuera de su lugar se avisan al momento." />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className={`tarjeta flex items-center gap-3 p-4 ${conectado ? '' : '!border-amber-300'}`}>
          {conectado ? <CheckCircle2 className="text-emerald-600" /> : <AlertTriangle className="text-amber-600" />}
          <div><p className="text-xs text-stone-500">Envío de correos</p><p className="font-medium">{conectado ? 'Conectado' : 'Falta conectar'}</p></div>
        </div>
        <div className="tarjeta flex items-center gap-3 p-4"><CalendarClock className="text-marca" />
          <div><p className="text-xs text-stone-500">Resumen diario</p><p className="font-medium">{est.programado ? '7:30 a.m. todos los días' : 'No programado'}</p></div></div>
        <div className="tarjeta flex items-center gap-3 p-4"><Mail className="text-marca" />
          <div className="min-w-0"><p className="text-xs text-stone-500">Último envío</p><p className="truncate text-sm font-medium">{est.ultimo ? new Date(est.ultimo.split(' · ')[0]).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + (est.ultimo.split(' · ')[1] ?? '') : 'Todavía no'}</p></div></div>
      </div>

      {msg && <div className="mb-4"><Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso></div>}

      <div className="grid gap-5 lg:grid-cols-2 *:min-w-0">
        <section className="tarjeta p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold"><Users size={17} className="text-marca" />Quién recibe qué</h2>
          <p className="mb-3 text-xs text-stone-500">Se asigna en <Link to="/usuarios" className="text-marca hover:underline">Usuarios</Link> → editar → “Encargado de”.</p>
          <ul className="divide-y divide-stone-100">
            {porModulo.map(m => (
              <li key={m.id} className="py-2">
                <p className="text-sm font-medium">{m.t}</p>
                <p className="text-xs text-stone-500">{m.quienes.length ? m.quienes.map(u => u.nombre + (u.avisos_activos ? '' : ' (pausado)')).join(', ') : <span className="text-amber-700">Nadie asignado</span>}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="tarjeta p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Eye size={17} className="text-marca" />Así le llegaría hoy</h2>
          <select className="campo mb-3" value={quien} onChange={e => setQuien(e.target.value)}>
            {usrs.map(u => <option key={u.id} value={u.id}>{u.nombre} · {(u.avisos ?? []).map(nombreModulo).join(', ') || 'sin temas'}</option>)}
          </select>
          {previa === undefined ? <Cargando /> : !previa || previa.total === 0 ? <p className="rounded-xl bg-stone-50 p-4 text-sm text-stone-500">No tiene pendientes hoy (o no tiene temas asignados). No se le manda correo.</p> : (
            <div className="max-h-[26rem] space-y-3 overflow-auto rounded-xl border border-stone-200 p-3">
              <p className="text-xs text-stone-500">Para: <b>{previa.para}</b> · {previa.total} aviso(s)</p>
              {previa.secciones.map(s => (
                <div key={s.modulo}>
                  <p className="mb-1 border-l-4 border-marca pl-2 text-sm font-semibold">{s.titulo} <span className="font-normal text-stone-500">({s.items.length})</span></p>
                  <ul className="space-y-1">{s.items.map((it, i) => <li key={i} className="text-xs"><b>{it.texto}</b> — <span className={it.urgente ? 'text-red-600' : 'text-stone-500'}>{it.detalle}</span></li>)}</ul>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="btn-sec" disabled={!conectado} onClick={() => probar(false)}><Send size={15} />Mandarle esta prueba</button>
            <button className="btn-sec" disabled={!conectado} onClick={() => probar(true)}><Mail size={15} />Mandar el resumen a todos ahora</button>
          </div>
        </section>
      </div>

      <section className="tarjeta mt-5 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold"><PlugZap size={17} className="text-marca" />{conectado ? 'Cambiar la conexión' : 'Conectar el envío de correos'}</h2>
        <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-stone-600">
          <li>Entra a <b>script.google.com</b> con la cuenta de la empresa y crea un proyecto nuevo “Avisos ERP Activos”. Pega el código de abajo.</li>
          <li>En <b>Configuración del proyecto → Propiedades del script</b> agrega <code className="rounded bg-stone-100 px-1">SECRETO</code> con una clave que tú inventes (12 caracteres o más).</li>
          <li><b>Implementar → Nueva implementación → Aplicación web</b>, ejecutar como <b>Yo</b>, acceso <b>Cualquier persona</b>. Autoriza y copia la URL que termina en <b>/exec</b>.</li>
          <li>Pega aquí la URL y la misma clave, guarda y manda una prueba.</li>
        </ol>
        <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
          <Campo label={est.url ? 'URL del Apps Script (ya guardada; deja vacío para no cambiarla)' : 'URL del Apps Script'}><input className="campo font-mono text-xs" placeholder="https://script.google.com/macros/s/…/exec" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} /></Campo>
          <Campo label={est.secreto ? 'Clave (ya guardada)' : 'Clave SECRETO'}><input className="campo" type="password" autoComplete="new-password" placeholder="La misma del Apps Script" value={f.secreto} onChange={e => setF({ ...f, secreto: e.target.value })} /></Campo>
          <button className="btn-primario" disabled={!f.url && !f.secreto}>Guardar</button>
        </form>
        <p className="mt-2 text-[11px] text-stone-400">La clave se guarda protegida en la base de datos y no se vuelve a mostrar.</p>
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-marca">Ver el código del Apps Script</summary>
          <div className="relative mt-2">
            <button type="button" className="btn-sec absolute right-2 top-2 !px-2 !py-1 text-xs" onClick={copiar}><Copy size={13} />{copiado ? 'Copiado' : 'Copiar'}</button>
            <pre className="max-h-80 overflow-auto rounded-xl bg-stone-900 p-4 text-[11px] leading-relaxed text-stone-100">{codigo}</pre>
          </div>
        </details>
      </section>
    </div>
  )
}
