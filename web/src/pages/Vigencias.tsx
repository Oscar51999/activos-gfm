import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, AlertOctagon, Hourglass, CheckCircle2, Search, RefreshCw, ExternalLink, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Cargando, Vacio } from '../components/ui'
import { TIPOS_DOC, VigenciaBadge, DocumentoModal, abrirArchivo, type TipoDoc, type Documento } from '../components/Documentos'
import { diasPara, fechaCorta } from '../components/Prestamo'

type Vig = Documento & { empresa: string; empresa_corto: string; activo_codigo: string | null; activo_descripcion: string | null; marca: string | null; modelo: string | null
  numero_economico: string | null; placa: string | null; empleado: string | null; inmueble: string | null; inmueble_codigo: string | null; dias_restantes: number; estado: 'vencido' | 'por_vencer' | 'vigente' }

const MESES = 6

/** Calendario de vencimientos: pólizas, tarjetas, verificaciones, calibraciones, licencias… */
export default function Vigencias() {
  const { puedeEditar, esAdmin } = useAuth()
  const [aviso, setAviso] = useState<{ ok: boolean; msg: string } | null>(null)
  const [probando, setProbando] = useState(false)
  async function probarAviso() {
    setProbando(true); setAviso(null)
    const { data, error } = await supabase.functions.invoke('alertas-vigencias', { body: {} })
    setProbando(false)
    if (error) { setAviso({ ok: false, msg: 'No se pudo generar el aviso: ' + error.message }); return }
    const r = data as { enviado: boolean; motivo?: string; destinatarios?: string[]; resumen: Record<string, number> }
    const txt = `${r.resumen.documentos_vencidos} vencidos, ${r.resumen.documentos_por_vencer} por vencer, ${r.resumen.prestamos_vencidos} préstamos vencidos, ${r.resumen.reportes_abiertos} reportes abiertos`
    setAviso(r.enviado ? { ok: true, msg: `Correo enviado a ${r.destinatarios?.length ?? 0} persona(s): ${txt}.` } : { ok: false, msg: `Resumen listo (${txt}), pero no se envió: ${r.motivo}.` })
  }
  const [lista, setLista] = useState<Vig[] | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'vencido' | 'semana' | 'mes'>('todos')
  const [tipo, setTipo] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [mes, setMes] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [renovar, setRenovar] = useState<Vig | null>(null)

  const cargar = () => { supabase.from('v_vigencias').select('*').order('fecha_vencimiento').limit(5000).then(({ data }) => setLista((data as Vig[]) ?? [])) }
  useEffect(cargar, [])

  const meses = useMemo(() => {
    const hoy = new Date(); hoy.setDate(1)
    return Array.from({ length: MESES }, (_, i) => { const d = new Date(hoy); d.setMonth(d.getMonth() + i); return { y: d.getFullYear(), m: d.getMonth(), etiqueta: d.toLocaleDateString('es-MX', { month: 'short' }) } })
  }, [])

  if (!lista) return <Cargando />
  const dias = (v: Vig) => diasPara(v.fecha_vencimiento!)
  const venc = lista.filter(v => dias(v) < 0)
  const semana = lista.filter(v => { const n = dias(v); return n >= 0 && n <= 7 })
  const mes30 = lista.filter(v => { const n = dias(v); return n >= 0 && n <= 30 })
  const alDia = lista.filter(v => dias(v) > 30)
  const porMes = meses.map(mm => lista.filter(v => { const [y, m] = v.fecha_vencimiento!.split('-').map(Number); return y === mm.y && m - 1 === mm.m }))
  const maxMes = Math.max(1, ...porMes.map(x => x.length))
  const empresas = [...new Map(lista.map(v => [v.empresa_id, v.empresa_corto])).entries()]
  const t = q.trim().toLowerCase()

  const vis = lista.filter(v => {
    const n = dias(v)
    if (filtro === 'vencido' && n >= 0) return false
    if (filtro === 'semana' && (n < 0 || n > 7)) return false
    if (filtro === 'mes' && (n < 0 || n > 30)) return false
    if (mes != null) { const [y, m] = v.fecha_vencimiento!.split('-').map(Number); if (y !== meses[mes].y || m - 1 !== meses[mes].m) return false }
    if (tipo && v.tipo !== tipo) return false
    if (empresa && v.empresa_id !== empresa) return false
    return !t || [v.activo_codigo, v.activo_descripcion, v.marca, v.modelo, v.placa, v.numero_economico, v.empleado, v.inmueble, v.inmueble_codigo, v.numero, v.emisor].some(x => x?.toLowerCase().includes(t))
  })
  const grupos: [string, Vig[]][] = [
    ['Vencidos', vis.filter(v => dias(v) < 0)],
    ['Esta semana', vis.filter(v => { const n = dias(v); return n >= 0 && n <= 7 })],
    ['Este mes', vis.filter(v => { const n = dias(v); return n > 7 && n <= 30 })],
    ['Más adelante', vis.filter(v => dias(v) > 30)],
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Vigencias</h1>
          <p className="mt-1 text-sm text-stone-500">Pólizas, tarjetas de circulación, verificaciones, calibraciones y licencias. Los documentos se agregan desde la ficha del activo o del empleado.</p>
        </div>
        {esAdmin && <button className="btn-sec" onClick={probarAviso} disabled={probando}><Mail size={16} />{probando ? 'Generando…' : 'Probar aviso por correo'}</button>}
      </div>

      {aviso && <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${aviso.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{aviso.msg}</div>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([['vencido', 'Vencidos', venc.length, AlertOctagon, 'text-red-700'], ['semana', 'Vencen en 7 días', semana.length, Hourglass, 'text-amber-700'], ['mes', 'Vencen en 30 días', mes30.length, CalendarClock, 'text-amber-700'], ['todos', 'Al día', alDia.length, CheckCircle2, 'text-emerald-700']] as const).map(([k, tt, n, I, c]) => (
          <button key={k} onClick={() => { setFiltro(filtro === k ? 'todos' : k); setMes(null) }} className={`tarjeta p-4 text-left transition ${filtro === k && k !== 'todos' ? '!border-marca ring-2 ring-marca/30' : 'hover:border-stone-300'}`}>
            <I size={18} className={n ? c : 'text-stone-400'} />
            <p className={`cifra mt-2 text-3xl font-semibold ${n && k !== 'todos' ? c : ''}`}>{n}</p>
            <p className="text-[11px] uppercase tracking-wider text-stone-500">{tt}</p>
          </button>
        ))}
      </div>

      <section className="tarjeta mb-6 p-5">
        <h2 className="mb-4 flex items-center justify-between text-sm font-semibold">Próximos {MESES} meses<span className="text-[10px] font-normal uppercase tracking-wider text-stone-400">toca un mes para filtrar</span></h2>
        <div className="grid grid-cols-6 items-end gap-2 sm:gap-4" style={{ height: 140 }}>
          {porMes.map((l, i) => {
            const rojos = l.filter(v => dias(v) < 0).length
            return (
              <button key={i} onClick={() => { setMes(mes === i ? null : i); setFiltro('todos') }} className="group flex h-full flex-col items-center justify-end gap-1.5">
                <span className="cifra text-xs text-stone-500 group-hover:text-tinta">{l.length || ''}</span>
                <span className={`w-full max-w-14 rounded-t-lg transition ${mes === i ? 'bg-marca shadow-[0_0_20px_-4px_rgb(249_178_52/.8)]' : rojos ? 'bg-red-500/70' : 'bg-marca/40 group-hover:bg-marca/70'}`}
                  style={{ height: `${Math.max(4, (l.length / maxMes) * 90)}px`, animation: 'crecer .8s cubic-bezier(.2,.8,.2,1) both', transformOrigin: 'bottom' }} />
                <span className={`text-[11px] uppercase tracking-wider ${mes === i ? 'text-marca' : 'text-stone-500'}`}>{meses[i].etiqueta}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 basis-60"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" /><input className="campo pl-10" placeholder="Buscar activo, placa, empleado, póliza…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <select className="campo w-auto" value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos los documentos</option>{(Object.keys(TIPOS_DOC) as TipoDoc[]).filter(k => TIPOS_DOC[k].vence).map(k => <option key={k} value={k}>{TIPOS_DOC[k].texto}</option>)}</select>
        <select className="campo w-auto" value={empresa} onChange={e => setEmpresa(e.target.value)}><option value="">Todas las empresas</option>{empresas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      </div>

      {vis.length === 0 ? <div className="tarjeta"><Vacio titulo={lista.length ? 'Nada con esos filtros' : 'Aún no hay documentos con vencimiento'} texto={lista.length ? undefined : 'Abre la ficha de un vehículo o equipo y agrega su póliza, tarjeta de circulación o certificado de calibración.'} accion={!lista.length && <Link to="/activos" className="btn-sec">Ir a Activos</Link>} /></div> : (
        <div className="space-y-6">
          {grupos.filter(([, l]) => l.length).map(([titulo, l]) => (
            <section key={titulo}>
              <h2 className={`mb-2 text-[11px] font-semibold uppercase tracking-[.16em] ${titulo === 'Vencidos' ? 'text-red-700' : 'text-stone-500'}`}>{titulo} · {l.length}</h2>
              <div className="tarjeta divide-y divide-stone-100 overflow-hidden">
                {l.map(v => {
                  const T = TIPOS_DOC[v.tipo] ?? TIPOS_DOC.otro
                  return (
                    <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${dias(v) < 0 ? 'bg-red-50 text-red-700' : 'bg-stone-100 text-marca'}`}><T.icono size={17} /></span>
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="truncate text-sm font-medium">{T.texto}{v.numero && <span className="font-mono text-xs text-stone-500"> · {v.numero}</span>}</p>
                        {v.activo_id
                          ? <Link to={`/activos/${v.activo_id}`} className="block truncate text-xs text-stone-500 hover:text-marca"><span className="font-mono text-marca">{v.activo_codigo}</span> · {[v.marca, v.modelo].filter(Boolean).join(' ') || v.activo_descripcion}{v.placa ? ` · ${v.placa}` : v.numero_economico ? ` · ${v.numero_economico}` : ''}</Link>
                          : v.inmueble_id ? <Link to={`/inmuebles/${v.inmueble_id}`} className="block truncate text-xs text-stone-500 hover:text-marca"><span className="font-mono text-marca">{v.inmueble_codigo}</span> · {v.inmueble}</Link>
                          : <Link to={`/empleados/${v.empleado_id}`} className="block truncate text-xs text-stone-500 hover:text-marca">{v.empleado}</Link>}
                      </div>
                      <span className="hidden w-28 truncate text-xs text-stone-500 md:block">{v.empresa_corto}</span>
                      <span className="hidden w-32 text-xs text-stone-500 sm:block">{fechaCorta(v.fecha_vencimiento!)}</span>
                      <VigenciaBadge fecha={v.fecha_vencimiento} avisar={v.avisar_dias} />
                      <div className="flex gap-1">
                        {v.archivo_path && <button onClick={() => abrirArchivo(v.archivo_path!)} className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-stone-500 hover:border-marca hover:text-marca" title="Ver archivo"><ExternalLink size={14} /></button>}
                        {puedeEditar && <button onClick={() => setRenovar(v)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-300 px-2.5 text-xs text-stone-600 hover:border-marca hover:text-marca"><RefreshCw size={13} />Renovar</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {renovar && <DocumentoModal abierto onCerrar={() => setRenovar(null)} onGuardado={() => { setRenovar(null); cargar() }} empresaId={renovar.empresa_id}
        activoId={renovar.activo_id ?? undefined} empleadoId={renovar.empleado_id ?? undefined} inmuebleId={renovar.inmueble_id ?? undefined} esVehiculo doc={{ ...renovar, vigente: true, renovado_de: null, created_at: '' }} renovar />}
    </div>
  )
}
