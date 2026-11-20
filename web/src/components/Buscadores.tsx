import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { nombreEmpleado } from '../lib/hooks'

export type ActivoMini = { id: string; codigo: string; descripcion: string; marca: string | null; modelo: string | null; serie: string | null; numero_economico: string | null
  placa: string | null; empresa_id: string; empresa: string; categoria: string | null; es_vehiculo: boolean | null; estatus: string; responsable: string | null; responsable_id: string | null; foto_principal: string | null; modelo_foto: string | null }
export type EmpleadoMini = { id: string; nombres: string; apellidos: string | null; puesto: string | null; empresa_id: string; empresas?: { nombre_corto: string | null; nombre: string } | null }

const COLS_ACT = 'id,codigo,descripcion,marca,modelo,serie,numero_economico,placa,empresa_id,empresa,categoria,es_vehiculo,estatus,responsable,responsable_id,foto_principal,modelo_foto'
const limpiar = (q: string) => q.replace(/[%,()]/g, ' ').trim()

/** Busca un activo por código, descripción, serie, placa o no. económico. */
export function BuscarActivo({ valor, onElegir, soloVehiculos = false, excluirBaja = true, placeholder = 'Código, descripción, serie o placa…' }: {
  valor: ActivoMini | null; onElegir: (a: ActivoMini | null) => void; soloVehiculos?: boolean; excluirBaja?: boolean; placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ActivoMini[]>([])
  const [abierto, setAbierto] = useState(false)
  const t = useRef<number>(0)
  useEffect(() => {
    window.clearTimeout(t.current)
    const x = limpiar(q)
    if (!abierto) return
    t.current = window.setTimeout(async () => {
      let s = supabase.from('v_activos').select(COLS_ACT).order('codigo').limit(15)
      if (x) s = s.or(`codigo.ilike.%${x}%,descripcion.ilike.%${x}%,serie.ilike.%${x}%,placa.ilike.%${x}%,numero_economico.ilike.%${x}%`)
      if (soloVehiculos) s = s.eq('es_vehiculo', true).is('montado_en', null)
      if (excluirBaja) s = s.neq('estatus', 'baja')
      const { data } = await s
      setRes((data as unknown as ActivoMini[]) ?? [])
    }, 220)
  }, [q, abierto, soloVehiculos, excluirBaja])

  if (valor) return (
    <div className="flex items-center gap-3 rounded-xl border border-marca/40 bg-marca/5 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{valor.descripcion}</p>
        <p className="truncate text-xs text-stone-500"><span className="font-mono">{valor.codigo}</span>{[valor.placa, valor.marca, valor.modelo, valor.responsable].filter(Boolean).map(x => ` · ${x}`).join('')}</p>
      </div>
      <button type="button" className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => onElegir(null)} aria-label="Quitar"><X size={16} /></button>
    </div>
  )
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
      <input className="campo !pl-9" value={q} placeholder={placeholder} onFocus={() => setAbierto(true)} onBlur={() => window.setTimeout(() => setAbierto(false), 180)} onChange={e => setQ(e.target.value)} />
      {abierto && res.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-stone-200 bg-panel p-1 shadow-xl">
          {res.map(a => (
            <li key={a.id}><button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onElegir(a); setQ(''); setAbierto(false) }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100">
              <span className="block truncate text-sm">{a.descripcion}</span>
              <span className="block truncate text-[11px] text-stone-500"><span className="font-mono">{a.codigo}</span>{[a.placa, a.serie, a.empresa, a.responsable].filter(Boolean).map(x => ` · ${x}`).join('')}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Busca un empleado activo por nombre o puesto. */
export function BuscarEmpleado({ valor, onElegir, empresaId, placeholder = 'Nombre del empleado…' }: {
  valor: EmpleadoMini | null; onElegir: (e: EmpleadoMini | null) => void; empresaId?: string; placeholder?: string
}) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<EmpleadoMini[]>([])
  const [abierto, setAbierto] = useState(false)
  const t = useRef<number>(0)
  useEffect(() => {
    window.clearTimeout(t.current)
    if (!abierto) return
    const x = limpiar(q)
    t.current = window.setTimeout(async () => {
      let s = supabase.from('empleados').select('id,nombres,apellidos,puesto,empresa_id,empresas(nombre,nombre_corto)').eq('activo', true).order('nombres').limit(15)
      if (x) s = s.or(`nombres.ilike.%${x}%,apellidos.ilike.%${x}%,puesto.ilike.%${x}%`)
      if (empresaId) s = s.eq('empresa_id', empresaId)
      const { data } = await s
      setRes((data as unknown as EmpleadoMini[]) ?? [])
    }, 220)
  }, [q, abierto, empresaId])

  if (valor) return (
    <div className="flex items-center gap-3 rounded-xl border border-marca/40 bg-marca/5 px-3 py-2">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nombreEmpleado(valor)}</p><p className="truncate text-xs text-stone-500">{[valor.puesto, valor.empresas?.nombre_corto || valor.empresas?.nombre].filter(Boolean).join(' · ') || '—'}</p></div>
      <button type="button" className="rounded p-1 text-stone-400 hover:text-tinta" onClick={() => onElegir(null)} aria-label="Quitar"><X size={16} /></button>
    </div>
  )
  return (
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
      <input className="campo !pl-9" value={q} placeholder={placeholder} onFocus={() => setAbierto(true)} onBlur={() => window.setTimeout(() => setAbierto(false), 180)} onChange={e => setQ(e.target.value)} />
      {abierto && res.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-stone-200 bg-panel p-1 shadow-xl">
          {res.map(e => (
            <li key={e.id}><button type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => { onElegir(e); setQ(''); setAbierto(false) }} className="w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100">
              <span className="block truncate text-sm">{nombreEmpleado(e)}</span>
              <span className="block truncate text-[11px] text-stone-500">{[e.puesto, e.empresas?.nombre_corto || e.empresas?.nombre].filter(Boolean).join(' · ') || '—'}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Toma fotos (cámara del celular o archivo), las reduce y las regresa como data URL. */
export async function fotoADataUrl(archivo: File, max = 1000, calidad = 0.72): Promise<string> {
  const img = await createImageBitmap(archivo)
  const escala = Math.min(1, max / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/jpeg', calidad)
}
