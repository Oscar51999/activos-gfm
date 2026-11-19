import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, Trash2, Sun, Moon, KeyRound, ShieldAlert, Save, Loader2 } from 'lucide-react'
import { supabase, ROLES, mensajeError } from '../lib/supabase'
import { useAuth, fotoPerfil } from '../lib/auth'
import { comprimir } from '../lib/fotos'
import { aplicarTema, aplicarApariencia, temaActual, ACENTOS, type Tema } from '../lib/tema'
import { Encabezado, Campo, Aviso } from '../components/ui'
import { Avatar } from '../components/Layout'

/** Mi perfil: foto, datos de contacto y cómo se ve la app. Lo tiene todo usuario. */
export default function Perfil() {
  const { perfil, esSuper, recargarPerfil, apariencia } = useAuth()
  const [acento, setAcento] = useState<string | null>(null)
  useEffect(() => { setAcento(perfil?.preferencias?.acento ?? null) }, [perfil])
  const [f, setF] = useState({ nombre: '', telefono: '', puesto: '' })
  const [empresas, setEmpresas] = useState<string[]>([])
  const [tema, setTema] = useState<Tema>(temaActual())
  const [msg, setMsg] = useState<{ t: 'ok' | 'error'; m: string } | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const archivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!perfil) return
    setF({ nombre: perfil.nombre ?? '', telefono: perfil.telefono ?? '', puesto: perfil.puesto ?? '' })
    if (perfil.todas_empresas) setEmpresas(['Todas las empresas'])
    else supabase.from('perfil_empresas').select('empresas(nombre)').eq('perfil_id', perfil.id)
      .then(({ data }) => setEmpresas(((data ?? []) as unknown as { empresas: { nombre: string } | null }[]).map(r => r.empresas?.nombre ?? '').filter(Boolean)))
  }, [perfil])

  if (!perfil) return null
  const iniciales = perfil.nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setMsg(null); setGuardando(true)
    const { error } = await supabase.from('perfiles').update({ nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, puesto: f.puesto.trim() || null }).eq('id', perfil!.id)
    setGuardando(false)
    if (error) return setMsg({ t: 'error', m: mensajeError(error) })
    await recargarPerfil(); setMsg({ t: 'ok', m: 'Datos guardados.' })
  }

  async function subir(a: File | undefined) {
    if (!a) return
    setMsg(null); setSubiendo(true)
    try {
      const blob = await comprimir(a, 480, 0.85)
      const path = `${perfil!.id}/foto-${Date.now()}.jpg`
      const up = await supabase.storage.from('perfiles').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (up.error) throw up.error
      const anterior = perfil!.foto_path
      const { error } = await supabase.from('perfiles').update({ foto_path: path }).eq('id', perfil!.id)
      if (error) throw error
      if (anterior) await supabase.storage.from('perfiles').remove([anterior])
      await recargarPerfil(); setMsg({ t: 'ok', m: 'Foto actualizada.' })
    } catch (e) { setMsg({ t: 'error', m: mensajeError(e) }) }
    finally { setSubiendo(false); if (archivo.current) archivo.current.value = '' }
  }

  async function quitarFoto() {
    if (!perfil!.foto_path) return
    await supabase.storage.from('perfiles').remove([perfil!.foto_path])
    await supabase.from('perfiles').update({ foto_path: null }).eq('id', perfil!.id)
    await recargarPerfil()
  }

  async function elegirAcento(hex: string | null) {
    setAcento(hex); aplicarApariencia({ ...apariencia, acento: hex ?? apariencia.acento })
    await supabase.from('perfiles').update({ preferencias: { ...(perfil!.preferencias ?? {}), acento: hex } }).eq('id', perfil!.id)
  }

  async function elegirTema(t: Tema) {
    aplicarTema(t); setTema(t)
    await supabase.from('perfiles').update({ preferencias: { ...(perfil!.preferencias ?? {}), tema: t } }).eq('id', perfil!.id)
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Mi perfil" sub="Tu foto, tus datos de contacto y cómo quieres ver el sistema."
        acciones={esSuper ? <Link to="/admin" className="btn-primario"><ShieldAlert size={16} />Administración</Link> : undefined} />

      <section className="tarjeta mb-5 flex flex-wrap items-center gap-5 p-5">
        <div className="relative">
          <div className="[&>span]:!h-24 [&>span]:!w-24 [&>span]:!text-2xl"><Avatar foto={fotoPerfil(perfil)} iniciales={iniciales} grande /></div>
          <button onClick={() => archivo.current?.click()} disabled={subiendo} aria-label="Cambiar foto"
            className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-stone-300 bg-panel text-stone-600 shadow hover:text-marca">
            {subiendo ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          </button>
          <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={e => subir(e.target.files?.[0])} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold">{perfil.nombre}</h2>
          <p className="font-mono text-xs text-stone-500">{perfil.usuario ?? '—'} · {perfil.email}</p>
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-full bg-marca/15 px-2.5 py-0.5 font-medium text-marca">{perfil.es_super ? 'Administrador principal' : ROLES[perfil.rol]}</span>
            {empresas.map(e => <span key={e} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-600">{e}</span>)}
          </p>
        </div>
        {perfil.foto_path && <button className="btn-sec !px-3 text-xs" onClick={quitarFoto}><Trash2 size={14} />Quitar foto</button>}
      </section>

      <form onSubmit={guardar} className="tarjeta mb-5 space-y-4 p-5">
        <h3 className="font-semibold">Mis datos</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Nombre completo" className="sm:col-span-2"><input className="campo" required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
          <Campo label="Teléfono / WhatsApp"><input className="campo" type="tel" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} placeholder="612 000 0000" /></Campo>
          <Campo label="Puesto"><input className="campo" value={f.puesto} onChange={e => setF({ ...f, puesto: e.target.value })} placeholder="Auxiliar de TI" /></Campo>
        </div>
        {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
        <div className="flex flex-wrap justify-between gap-2">
          <Link to="/cambiar-contrasena" className="btn-sec"><KeyRound size={15} />Cambiar contraseña</Link>
          <button className="btn-primario" disabled={guardando}><Save size={15} />{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>

      <section className="tarjeta p-5">
        <h3 className="font-semibold">Apariencia</h3>
        <p className="mb-4 text-sm text-stone-500">Se guarda en tu perfil: la verás igual en cualquier equipo.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['oscuro', 'Oscuro', 'Fondo negro, ideal para oficina y de noche', Moon], ['claro', 'Claro', 'Fondo blanco, como un documento', Sun]] as const).map(([t, n, d, I]) => (
            <button key={t} onClick={() => elegirTema(t)} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${tema === t ? 'border-marca bg-marca/10' : 'border-stone-200 hover:border-stone-300'}`}>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${t === 'claro' ? 'bg-[#F3F4F6] text-[#1C1F24] ring-1 ring-black/10' : 'bg-[#06070A] text-[#EEF0F3] ring-1 ring-white/10'}`}><I size={18} /></span>
              <span><span className="block font-medium">{n}</span><span className="block text-xs text-stone-500">{d}</span></span>
            </button>
          ))}
        </div>
        <h4 className="mb-2 mt-5 text-sm font-medium">Mi color</h4>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => elegirAcento(null)} className={`rounded-xl border px-3 py-2 text-sm ${!acento ? 'border-marca bg-marca/10' : 'border-stone-200'}`}>El de la empresa</button>
          {ACENTOS.map(c => (
            <button key={c.hex} onClick={() => elegirAcento(c.hex)} title={c.nombre} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${acento === c.hex ? 'border-marca bg-marca/10' : 'border-stone-200 hover:border-stone-300'}`}>
              <span className="h-4 w-4 rounded-full" style={{ background: c.hex }} />{c.nombre}
            </button>
          ))}
          <label className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2 text-sm">Otro <input type="color" value={acento ?? '#E2A64B'} onChange={e => elegirAcento(e.target.value)} className="h-6 w-8 cursor-pointer bg-transparent" /></label>
        </div>
      </section>
    </div>
  )
}
