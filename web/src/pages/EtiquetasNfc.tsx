import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Nfc, CheckCircle2, AlertTriangle, SkipForward, Search, Undo2 } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { useLista } from '../lib/hooks'
import { useAuth } from '../lib/auth'
import { Encabezado, Cargando, Vacio, Aviso } from '../components/ui'
import FotoActivo from '../components/FotoActivo'
import { BotonNfcCelular, ligarNfc } from '../components/Nfc'

type A = { id: string; codigo: string; descripcion: string; serie: string | null; numero_economico: string | null; marca: string | null; modelo: string | null; categoria: string; ubicacion: string | null; responsable: string | null
  empresa: string; foto_principal: string | null; modelo_foto: string | null; nfc_uid: string | null }
type Hecho = { id: string; codigo: string; uid: string }

/** Ligar stickers NFC en serie: el sistema te pone un activo, acercas un sticker al lector y pasa al siguiente. */
export default function EtiquetasNfc() {
  const { puedeEditar } = useAuth()
  const empresas = useLista('empresas')
  const categorias = useLista('categorias', 'id,nombre')
  const ubicaciones = useLista('ubicaciones', 'id,nombre,empresa_id')
  const [f, setF] = useState({ empresa: '', categoria: '', ubicacion: '', q: '', todos: false })
  const [lista, setLista] = useState<A[] | null>(null)
  const [actual, setActual] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [hechos, setHechos] = useState<Hecho[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; t: string; otro?: { id: string; codigo: string } } | null>(null)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let q = supabase.from('v_activos').select('id,codigo,descripcion,serie,numero_economico,marca,modelo,categoria,ubicacion,responsable,empresa,foto_principal,modelo_foto,nfc_uid').neq('estatus', 'baja').order('codigo')
    if (!f.todos) q = q.is('nfc_uid', null)
    if (f.empresa) q = q.eq('empresa_id', f.empresa)
    if (f.categoria) q = q.eq('categoria_id', f.categoria)
    if (f.ubicacion) q = q.eq('ubicacion_id', f.ubicacion)
    const t = f.q.replace(/[,()"%]/g, '').trim()
    if (t) q = q.or(`codigo.ilike.%${t}%,descripcion.ilike.%${t}%,serie.ilike.%${t}%,numero_economico.ilike.%${t}%,responsable.ilike.%${t}%`)
    const h = setTimeout(() => q.limit(500).then(({ data, error }) => {
      if (error) { setError(mensajeError(error)); return }
      const l = (data as A[]) ?? []; setLista(l); setActual(x => (x && l.some(a => a.id === x)) ? x : l[0]?.id ?? null)
    }), 250)
    return () => clearTimeout(h)
  }, [f])

  const a = useMemo(() => lista?.find(x => x.id === actual) ?? null, [lista, actual])
  const pendientes = lista?.filter(x => !x.nfc_uid).length ?? 0
  useEffect(() => { input.current?.focus() }, [actual])

  function siguiente(desde: string) {
    if (!lista) return
    const i = lista.findIndex(x => x.id === desde)
    const sig = lista.slice(i + 1).find(x => !x.nfc_uid) ?? lista.find(x => !x.nfc_uid && x.id !== desde)
    setActual(sig?.id ?? null)
  }

  async function ligar(valor: string) {
    if (!a || !valor.trim()) return
    setTexto('')
    const r = await ligarNfc(a.id, valor)
    if (r.error) {
      setMsg({ ok: false, t: r.error, otro: r.otro })
      try { navigator.vibrate?.([60, 40, 60]) } catch { /* */ }
      return
    }
    setMsg({ ok: true, t: `${a.codigo} quedó con el sticker ${r.uid}` })
    setHechos(h => [{ id: a.id, codigo: a.codigo, uid: r.uid! }, ...h])
    setLista(l => l!.map(x => x.id === a.id ? { ...x, nfc_uid: r.uid! } : x))
    siguiente(a.id)
  }

  async function deshacer(h: Hecho) {
    const { error } = await supabase.from('activos').update({ nfc_uid: null }).eq('id', h.id)
    if (error) { setMsg({ ok: false, t: mensajeError(error) }); return }
    setHechos(x => x.filter(y => y.id !== h.id))
    setLista(l => l!.map(x => x.id === h.id ? { ...x, nfc_uid: null } : x))
    setActual(h.id); setMsg(null)
  }

  if (!puedeEditar) return <div className="tarjeta"><Vacio titulo="Sin permiso" texto="Solo quien puede editar activos liga stickers NFC." /></div>
  const ubis = ubicaciones.items.filter(u => !f.empresa || u.empresa_id === f.empresa)

  return (
    <div>
      <Encabezado titulo="Etiquetas NFC" sub="Pega el sticker en el equipo, acércalo al lector y queda ligado. El sistema pasa solo al siguiente activo." />
      {error && <div className="mb-4"><Aviso>{error}</Aviso></div>}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative lg:col-span-2"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input className="campo !pl-9" placeholder="Buscar código, serie, responsable…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} /></label>
        <select className="campo" value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value, ubicacion: '' })}><option value="">Todas las empresas</option>{empresas.items.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
        <select className="campo" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })}><option value="">Todas las categorías</option>{categorias.items.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <select className="campo" value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })}><option value="">Todas las ubicaciones</option>{ubis.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
      </div>
      <label className="mb-5 inline-flex items-center gap-2 text-sm text-stone-600"><input type="checkbox" checked={f.todos} onChange={e => setF({ ...f, todos: e.target.checked })} />Mostrar también los que ya tienen sticker (para cambiarlo)</label>

      {!lista ? <Cargando /> : (
        <>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem] *:min-w-0">
          <section className="tarjeta p-5">
            {a ? (
              <>
                <div className="mb-4 flex gap-4">
                  <FotoActivo foto={a.foto_principal} fotoModelo={a.modelo_foto} categoria={a.categoria} className="size-24 shrink-0 rounded-xl" icono={30} />
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-stone-500">{a.codigo} · {a.empresa}</p>
                    <h2 className="text-lg font-semibold">{a.descripcion}</h2>
                    <p className="text-sm text-stone-500">{[a.marca, a.modelo, a.serie && `Serie ${a.serie}`, a.numero_economico && `No. ${a.numero_economico}`].filter(Boolean).join(' · ')}</p>
                    <p className="text-sm text-stone-500">{[a.ubicacion, a.responsable].filter(Boolean).join(' · ') || 'Sin ubicación ni responsable'}</p>
                    {a.nfc_uid && <p className="mt-1 font-mono text-xs text-amber-700">Ya tiene el sticker {a.nfc_uid}; si lees otro, se reemplaza.</p>}
                  </div>
                </div>
                <form onSubmit={e => { e.preventDefault(); ligar(texto) }} className="flex gap-2">
                  <span className="relative flex-1"><Nfc size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-marca" />
                    <input ref={input} autoFocus autoComplete="off" className="campo !pl-10 font-mono" placeholder="Acerca el sticker al lector…" value={texto} onChange={e => setTexto(e.target.value)} /></span>
                  <button className="btn-primario">Ligar</button>
                  <button type="button" className="btn-sec" title="Saltar este activo" onClick={() => { siguiente(a.id); setMsg(null) }}><SkipForward size={16} /></button>
                </form>
                <div className="mt-3"><BotonNfcCelular onLeer={uid => ligar(uid)} texto="Ligar con el celular" /></div>
                {msg && (
                  <div key={hechos.length + msg.t} className={`mt-4 flex animate-entrar items-center gap-3 rounded-xl border px-4 py-3 text-sm ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {msg.ok ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
                    <span>{msg.t}{msg.otro && <> <Link className="underline" to={`/activos/${msg.otro.id}`}>Ver {msg.otro.codigo}</Link></>}</span>
                  </div>
                )}
                <p className="mt-4 text-[11px] text-stone-400">Si el cursor se sale del campo, haz clic en él antes de acercar el siguiente sticker. El lector escribe el número y da Enter solo.</p>
              </>
            ) : <Vacio titulo={pendientes === 0 && lista.length ? '¡Todos tienen sticker!' : 'No hay activos con estos filtros'} texto="Cambia los filtros o marca “Mostrar también los que ya tienen sticker”." />}
          </section>

          <aside className="space-y-4">
            <div className="tarjeta p-4">
              <p className="text-xs uppercase tracking-wider text-stone-500">En esta sesión</p>
              <p className="cifra text-3xl font-semibold">{hechos.length}</p>
              <p className="text-xs text-stone-500">ligados · faltan {pendientes} en la lista</p>
              {hechos.length > 0 && <ul className="mt-3 max-h-60 space-y-1 overflow-auto">{hechos.map(h => (
                <li key={h.id} className="flex items-center gap-2 text-xs"><CheckCircle2 size={13} className="text-emerald-600" /><Link to={`/activos/${h.id}`} className="font-mono hover:underline">{h.codigo}</Link><span className="min-w-0 flex-1 truncate font-mono text-stone-400">{h.uid}</span>
                  <button className="text-stone-400 hover:text-red-600" title="Deshacer" onClick={() => deshacer(h)}><Undo2 size={13} /></button></li>))}</ul>}
            </div>
          </aside>
        </div>

        <section className="mt-6">
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold"><span>Equipos ({lista.length})</span><span className="text-xs font-normal text-stone-500">Toca un equipo para ligarle su sticker</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {lista.map(x => (
              <button key={x.id} onClick={() => { setActual(x.id); setMsg(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className={`tarjeta group overflow-hidden text-left transition hover:-translate-y-0.5 hover:border-marca/60 ${x.id === actual ? '!border-marca ring-2 ring-marca/40' : ''}`}>
                <div className="relative">
                  <FotoActivo foto={x.foto_principal} fotoModelo={x.modelo_foto} categoria={x.categoria} className="aspect-[4/3] w-full" icono={34} />
                  <span className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${x.nfc_uid ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-stone-50 text-stone-500 ring-stone-200'}`}>
                    {x.nfc_uid ? <CheckCircle2 size={11} /> : <Nfc size={11} />}{x.nfc_uid ? 'Con sticker' : 'Sin sticker'}
                  </span>
                </div>
                <div className="space-y-0.5 p-3">
                  <p className="font-mono text-[11px] text-stone-500">{x.codigo}</p>
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{[x.marca, x.modelo].filter(Boolean).join(' ') || x.descripcion}</p>
                  <p className="truncate text-xs text-stone-500">{x.responsable || x.ubicacion || 'Sin responsable'}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        </>
      )}
    </div>
  )
}
