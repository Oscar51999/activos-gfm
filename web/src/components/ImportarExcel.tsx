import { useEffect, useMemo, useRef, useState } from 'react'
import { FileSpreadsheet, Upload, Download, Check, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react'
import { libroExcel, descargar } from '../lib/excel'
import { leerTabla } from '../lib/lector'
import { Modal, Aviso } from './ui'

/** Una columna de la plantilla: lo que se pide, si es obligatorio y qué valores acepta. */
export type ColImport = {
  key: string; titulo: string; requerido?: boolean; ayuda?: string; ejemplo?: string
  tipo?: 'texto' | 'numero' | 'fecha' | 'bool'
  valores?: string[]             // valores válidos (se listan en la hoja "Valores válidos")
}
export type ResultadoImport = { ok: number; errores: { fila: number; error: string }[]; avisos?: string[] }
export type Variante = { id: string; nombre: string; grupo?: string }

export const normal = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*:]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** Convierte lo que venga del Excel a fecha AAAA-MM-DD (texto, número de serie de Excel o dd/mm/aaaa). */
export function aFecha(v: string): string | null {
  const s = String(v ?? '').trim(); if (!s) return null
  if (/^\d{4,5}(\.\d+)?$/.test(s) && Number(s) > 20000) { const d = new Date(Math.round((Number(s) - 25569) * 864e5)); return d.toISOString().slice(0, 10) }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}
export const aNumero = (v: string) => { const s = String(v ?? '').replace(/[$,\s]/g, ''); if (!s) return null; const n = Number(s); return isFinite(n) ? n : NaN }
export const aBool = (v: string) => /^(si|sí|s|x|1|true|verdadero|yes)$/i.test(String(v ?? '').trim())

/**
 * Importar desde Excel con dos opciones: cargar el archivo o descargar la plantilla.
 * Si hay variantes (por ejemplo, la categoría del equipo), la plantilla cambia según la que se elija.
 */
export default function ImportarExcel({ abierto, onCerrar, onListo, titulo, columnas, variantes, etiquetaVariante = 'Tipo', valoresExtra, procesar, nombreArchivo }: {
  abierto: boolean; onCerrar: () => void; onListo: () => void; titulo: string
  columnas: ColImport[] | ((variante: string) => ColImport[])
  variantes?: Variante[]; etiquetaVariante?: string
  valoresExtra?: { nombre: string; valores: string[] }[]
  procesar: (filas: { n: number; datos: Record<string, string> }[], variante: string) => Promise<ResultadoImport>
  nombreArchivo: string
}) {
  const [variante, setVariante] = useState('')
  const [filas, setFilas] = useState<{ n: number; datos: Record<string, string> }[] | null>(null)
  const [encabezados, setEncabezados] = useState<{ reconocidos: string[]; ignorados: string[] }>({ reconocidos: [], ignorados: [] })
  const [archivo, setArchivo] = useState('')
  const [error, setError] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImport | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (abierto) { setFilas(null); setError(''); setResultado(null); setArchivo('') } }, [abierto])

  const cols = useMemo(() => typeof columnas === 'function' ? columnas(variante) : columnas, [columnas, variante])
  const nombreVar = variantes?.find(v => v.id === variante)?.nombre

  function plantilla() {
    const ejemplo = Object.fromEntries(cols.map(c => [c.key, c.ejemplo ?? '']))
    const listas = [...cols.filter(c => c.valores?.length).map(c => ({ nombre: c.titulo, valores: c.valores! })), ...(valoresExtra ?? [])]
    descargar(libroExcel<Record<string, string>>([
      { nombre: 'Datos', columnas: cols.map(c => ({ titulo: c.titulo + (c.requerido ? ' *' : ''), valor: () => '', ancho: Math.max(14, Math.min(40, (c.ejemplo?.length ?? 0) + 4, c.titulo.length + 6)) })), filas: [] },
      { nombre: 'Instrucciones', titulo: `Plantilla de ${titulo}${nombreVar ? ' · ' + nombreVar : ''}. Llena la hoja "Datos" (una fila por registro) y súbela en el sistema. Las columnas con * son obligatorias.`,
        columnas: [{ titulo: 'Columna', valor: f => f.titulo, ancho: 28 }, { titulo: 'Obligatoria', valor: f => f.req, ancho: 12 }, { titulo: 'Qué poner', valor: f => f.ayuda, ancho: 60 }, { titulo: 'Ejemplo', valor: f => f.ejemplo, ancho: 30 }],
        filas: cols.map(c => ({ titulo: c.titulo, req: c.requerido ? 'Sí' : 'No', ayuda: c.ayuda ?? (c.tipo === 'fecha' ? 'Fecha: AAAA-MM-DD o dd/mm/aaaa' : c.tipo === 'bool' ? 'Sí o No' : c.tipo === 'numero' ? 'Solo número' : c.valores?.length ? `Uno de la hoja "Valores válidos"` : 'Texto'), ejemplo: ejemplo[c.key] })) },
      ...(listas.length ? [{ nombre: 'Valores válidos', titulo: 'Escribe los valores tal como aparecen aquí (no importan mayúsculas ni acentos).',
        columnas: listas.map((l, i) => ({ titulo: l.nombre, valor: (f: Record<string, string>) => f[i] ?? '', ancho: Math.min(48, Math.max(16, ...l.valores.slice(0, 200).map(v => v.length + 2))) })),
        filas: Array.from({ length: Math.max(...listas.map(l => l.valores.length)) }, (_, r) => Object.fromEntries(listas.map((l, i) => [i, l.valores[r] ?? '']))) }] : []),
    ]), `plantilla-${nombreArchivo}${nombreVar ? '-' + normal(nombreVar).replace(/[^a-z0-9]+/g, '-') : ''}.xlsx`)
  }

  async function cargar(f?: File) {
    if (!f) return
    setError(''); setLeyendo(true); setArchivo(f.name); setResultado(null)
    try {
      const tabla = (await leerTabla(f)).map(r => r.map(c => String(c ?? '').trim()))
      // encabezado: el primer renglón donde se reconozcan al menos dos columnas (o la obligatoria)
      const porTitulo = new Map(cols.map(c => [normal(c.titulo), c.key]))
      const ix = tabla.findIndex(r => r.filter(c => porTitulo.has(normal(c))).length >= Math.min(2, cols.length))
      if (ix < 0) throw new Error('No encontré los encabezados de la plantilla. Descarga la plantilla y copia tus datos en la hoja "Datos".')
      const enc = tabla[ix].map(c => porTitulo.get(normal(c)) ?? null)
      setEncabezados({ reconocidos: cols.filter(c => enc.includes(c.key)).map(c => c.titulo), ignorados: tabla[ix].filter((c, i) => c && !enc[i]) })
      const datos = tabla.slice(ix + 1).map((r, k) => ({ n: ix + k + 2, datos: Object.fromEntries(enc.map((key, i) => [key, r[i] ?? '']).filter(([key]) => key)) as Record<string, string> }))
        .filter(x => Object.values(x.datos).some(v => v))
      if (!datos.length) throw new Error('La hoja no trae renglones con datos.')
      setFilas(datos)
    } catch (e) { setError((e as Error).message); setFilas(null) } finally { setLeyendo(false); if (input.current) input.current.value = '' }
  }

  const revisadas = useMemo(() => (filas ?? []).map(f => {
    const faltan = cols.filter(c => c.requerido && !f.datos[c.key]).map(c => c.titulo)
    const malos = cols.filter(c => f.datos[c.key] && ((c.tipo === 'numero' && Number.isNaN(aNumero(f.datos[c.key]))) || (c.tipo === 'fecha' && !aFecha(f.datos[c.key])))).map(c => c.titulo)
    return { ...f, problema: [faltan.length && `Falta: ${faltan.join(', ')}`, malos.length && `Revisa: ${malos.join(', ')}`].filter(Boolean).join(' · ') }
  }), [filas, cols])
  const buenas = revisadas.filter(f => !f.problema)

  async function importar() {
    setImportando(true); setError('')
    try { setResultado(await procesar(buenas, variante)) } catch (e) { setError((e as Error).message) } finally { setImportando(false) }
  }

  const visibles = cols.filter(c => (filas ?? []).some(f => f.datos[c.key])).slice(0, 8)

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo={`Importar ${titulo} desde Excel`} ancho="max-w-4xl">
      {resultado ? (
        <div className="py-6 text-center">
          <div className={`mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full ring-1 ${resultado.errores.length ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>{resultado.errores.length ? <AlertTriangle size={28} /> : <Check size={30} />}</div>
          <p className="text-lg font-semibold">{resultado.ok} registro(s) importados</p>
          {resultado.avisos?.map((a, i) => <p key={i} className="mt-1 text-sm text-stone-500">{a}</p>)}
          {resultado.errores.length > 0 && <div className="mx-auto mt-4 max-h-56 max-w-xl overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
            <p className="mb-1 font-semibold">{resultado.errores.length} renglón(es) no se importaron:</p>
            {resultado.errores.map((e, i) => <p key={i}>Fila {e.fila}: {e.error}</p>)}
          </div>}
          <button className="btn-primario mt-6" onClick={onListo}>Listo</button>
        </div>
      ) : !filas ? (
        <div className="space-y-4">
          {variantes && variantes.length > 0 && (
            <label className="block"><span className="etiqueta">{etiquetaVariante} (la plantilla trae las columnas que ese tipo necesita)</span>
              <select className="campo" value={variante} onChange={e => setVariante(e.target.value)}>
                <option value="">General (columnas básicas)</option>
                {[...new Set(variantes.map(v => v.grupo ?? ''))].map(g => g ? <optgroup key={g} label={g}>{variantes.filter(v => v.grupo === g).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}</optgroup>
                  : variantes.filter(v => !v.grupo).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => input.current?.click()} disabled={leyendo} className="viva group flex flex-col items-start gap-3 rounded-2xl border border-marca/50 bg-gradient-to-br from-marca/15 to-transparent p-5 text-left transition hover:border-marca">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-b from-[#EBB866] to-[#CF9336] text-[#120D04]">{leyendo ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}</span>
              <span><span className="block font-semibold">Cargar archivo</span><span className="block text-sm text-stone-500">Sube tu Excel (.xlsx) o CSV ya lleno. Revisas antes de importar.</span></span>
            </button>
            <button onClick={plantilla} className="viva group flex flex-col items-start gap-3 rounded-2xl border border-stone-200 p-5 text-left transition hover:border-marca/60">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><Download size={22} /></span>
              <span><span className="block font-semibold">Descargar plantilla de Excel</span><span className="block text-sm text-stone-500">{nombreVar ? `Con las columnas para ${nombreVar}. ` : ''}Trae instrucciones y la lista de valores válidos.</span></span>
            </button>
          </div>
          <input ref={input} type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden onChange={e => cargar(e.target.files?.[0])} />
          <div className="rounded-xl border border-stone-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-stone-500"><FileSpreadsheet size={13} />Columnas{nombreVar ? ` para ${nombreVar}` : ''}</p>
            <div className="flex flex-wrap gap-1.5">{cols.map(c => <span key={c.key} className={`rounded-md border px-2 py-1 text-[11px] ${c.requerido ? 'border-marca/40 bg-marca/10 text-marca' : 'border-stone-200 text-stone-600'}`}>{c.titulo}{c.requerido ? ' *' : ''}</span>)}</div>
          </div>
          {error && <Aviso>{error}</Aviso>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button className="flex items-center gap-1 text-sm text-stone-500 hover:text-tinta" onClick={() => setFilas(null)}><ArrowLeft size={15} />Otro archivo</button>
            <p className="text-sm"><span className="font-mono text-xs text-stone-500">{archivo}</span> · <b className="text-emerald-700">{buenas.length} listos</b>{revisadas.length - buenas.length ? <> · <b className="text-red-700">{revisadas.length - buenas.length} con problemas</b></> : null}</p>
          </div>
          {encabezados.ignorados.length > 0 && <Aviso tipo="info">No reconocí estas columnas y se ignoran: {encabezados.ignorados.join(', ')}.</Aviso>}
          <div className="max-h-80 overflow-auto rounded-xl border border-stone-200">
            <table className="w-full min-w-[640px] text-xs">
              <thead className="sticky top-0 bg-panel"><tr className="text-left text-stone-500"><th className="px-3 py-2">Fila</th>{visibles.map(c => <th key={c.key} className="px-3 py-2">{c.titulo}</th>)}<th className="px-3 py-2">Estado</th></tr></thead>
              <tbody className="divide-y divide-stone-100">{revisadas.slice(0, 300).map(f => (
                <tr key={f.n} className={f.problema ? 'bg-red-50/50' : ''}><td className="px-3 py-1.5 text-stone-400">{f.n}</td>{visibles.map(c => <td key={c.key} className="max-w-[180px] truncate px-3 py-1.5">{f.datos[c.key]}</td>)}
                  <td className="px-3 py-1.5">{f.problema ? <span className="text-red-700">{f.problema}</span> : <span className="text-emerald-700">Listo</span>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          {revisadas.length > 300 && <p className="text-xs text-stone-500">Se muestran 300 de {revisadas.length}.</p>}
          {error && <Aviso>{error}</Aviso>}
          <div className="flex justify-end gap-2"><button className="btn-sec" onClick={onCerrar}>Cancelar</button>
            <button className="btn-primario" disabled={!buenas.length || importando} onClick={importar}>{importando ? <><Loader2 size={15} className="animate-spin" />Importando…</> : <><Check size={15} />Importar {buenas.length}</>}</button></div>
        </div>
      )}
    </Modal>
  )
}
