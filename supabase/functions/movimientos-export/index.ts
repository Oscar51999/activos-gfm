// Exporta los movimientos del control de activos para otro sistema. Solo cantidades y lugares: nunca importes ni costos.
// GET con encabezado  x-integracion-secreto: <INTEGRACION_SECRETO>
//   ?tipo=almacen|resguardos|vales   (default almacen)
//   &desde=2026-10-01&hasta=2026-10-31   (default últimos 30 días)
//   &empresa=<id o nombre corto>   &formato=json|csv   (default json)
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-integracion-secreto', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const DIA = /^\d{4}-\d{2}-\d{2}$/
type Fila = Record<string, unknown>
const nombre = (x: unknown) => (x as { nombre?: string } | null)?.nombre ?? null

function csv(filas: Fila[]) {
  if (!filas.length) return ''
  const cols = Object.keys(filas[0])
  const c = (v: unknown) => { const s = v == null ? '' : Array.isArray(v) ? v.join(' | ') : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + [cols.join(','), ...filas.map(f => cols.map(k => c(f[k])).join(','))].join('\r\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'Usa GET' }, 405)
  const secreto = Deno.env.get('INTEGRACION_SECRETO')
  if (!secreto) return json({ error: 'Falta configurar INTEGRACION_SECRETO en el proyecto' }, 503)
  if (req.headers.get('x-integracion-secreto') !== secreto) return json({ error: 'No autorizado' }, 401)

  const u = new URL(req.url)
  const tipo = u.searchParams.get('tipo') ?? 'almacen'
  const desde = u.searchParams.get('desde') ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const hasta = u.searchParams.get('hasta') ?? new Date().toISOString().slice(0, 10)
  if (!DIA.test(desde) || !DIA.test(hasta)) return json({ error: 'Fechas en formato AAAA-MM-DD' }, 400)
  const ini = `${desde}T00:00:00-07:00`, fin = `${hasta}T23:59:59.999-07:00`
  const formato = u.searchParams.get('formato') === 'csv' ? 'csv' : 'json'
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let empresaId: string | null = null
  const emp = u.searchParams.get('empresa')
  if (emp) {
    const { data } = /^[0-9a-f-]{36}$/i.test(emp) ? await db.from('empresas').select('id').eq('id', emp).maybeSingle()
      : await db.from('empresas').select('id').ilike('nombre_corto', emp).maybeSingle()
    if (!data) return json({ error: `Empresa "${emp}" no encontrada` }, 404)
    empresaId = data.id
  }

  let filas: Fila[] = []
  if (tipo === 'almacen') {
    let q = db.from('movimientos_consumible').select('id,created_at,tipo,cantidad,lote,caducidad,notas,consumibles(nombre,unidad),ubicaciones(nombre),empresas(nombre_corto),ordenes_trabajo:ot_id(folio),vales_salida:vale_id(folio)')
      .gte('created_at', ini).lte('created_at', fin).order('created_at').limit(20000)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 500)
    filas = (data ?? []).map((m: Fila) => ({
      id: m.id, fecha: m.created_at, empresa: (m.empresas as { nombre_corto?: string } | null)?.nombre_corto ?? null, tipo: m.tipo,
      articulo: nombre(m.consumibles), unidad: (m.consumibles as { unidad?: string } | null)?.unidad ?? null, cantidad: m.cantidad,
      lote: m.lote, caducidad: m.caducidad, ubicacion: nombre(m.ubicaciones),
      orden_trabajo: (m.ordenes_trabajo as { folio?: string } | null)?.folio ?? null, vale: (m.vales_salida as { folio?: string } | null)?.folio ?? null, notas: m.notas,
    }))
  } else if (tipo === 'resguardos') {
    let q = db.from('movimientos').select('id,folio,tipo,fecha,cancelado,recibe_nombre,entrega_nombre,empresas(nombre_corto),ubicaciones:a_ubicacion_id(nombre),empleados:a_empleado_id(nombres,apellidos),movimiento_activos(activos(codigo,descripcion,serie))')
      .gte('fecha', ini).lte('fecha', fin).order('fecha').limit(10000)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 500)
    for (const m of (data ?? []) as Fila[]) {
      const e = m.empleados as { nombres?: string; apellidos?: string } | null
      for (const ma of (m.movimiento_activos as { activos: { codigo: string; descripcion: string; serie: string | null } | null }[]) ?? [])
        filas.push({ folio: m.folio, fecha: m.fecha, empresa: (m.empresas as { nombre_corto?: string } | null)?.nombre_corto ?? null, tipo: m.tipo, cancelado: m.cancelado,
          activo: ma.activos?.codigo ?? null, descripcion: ma.activos?.descripcion ?? null, serie: ma.activos?.serie ?? null,
          empleado: e ? [e.nombres, e.apellidos].filter(Boolean).join(' ') : null, ubicacion: nombre(m.ubicaciones), entrega: m.entrega_nombre, recibe: m.recibe_nombre })
    }
  } else if (tipo === 'vales') {
    let q = db.from('vales_salida').select('folio,estatus,created_at,salida_at,recibido_at,transportista,vehiculo,motivo,activos,material,empresas(nombre_corto),origen:origen_id(nombre),destino:destino_id(nombre)')
      .gte('created_at', ini).lte('created_at', fin).order('created_at').limit(10000)
    if (empresaId) q = q.eq('empresa_id', empresaId)
    const { data, error } = await q
    if (error) return json({ error: error.message }, 500)
    const ids = [...new Set(((data ?? []) as Fila[]).flatMap(v => (v.activos as string[]) ?? []))]
    const cod = new Map<string, string>()
    for (let i = 0; i < ids.length; i += 500) {
      const { data: a } = await db.from('activos').select('id,codigo').in('id', ids.slice(i, i + 500))
      for (const x of a ?? []) cod.set(x.id, x.codigo)
    }
    filas = ((data ?? []) as Fila[]).map(v => ({
      folio: v.folio, estatus: v.estatus, emitido: v.created_at, salida: v.salida_at, llegada: v.recibido_at,
      empresa: (v.empresas as { nombre_corto?: string } | null)?.nombre_corto ?? null, origen: nombre(v.origen), destino: nombre(v.destino),
      activos: ((v.activos as string[]) ?? []).map(id => cod.get(id) ?? id),
      material: ((v.material as { cantidad: number; descripcion: string; unidad?: string }[]) ?? []).map(m => `${m.cantidad}${m.unidad ? ' ' + m.unidad : ''} ${m.descripcion}`),
      transportista: v.transportista, vehiculo: v.vehiculo, motivo: v.motivo,
    }))
  } else return json({ error: 'tipo debe ser almacen, resguardos o vales' }, 400)

  if (formato === 'csv') return new Response(csv(filas), { headers: { ...cors, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="movimientos-${tipo}-${desde}-a-${hasta}.csv"` } })
  return json({ tipo, desde, hasta, total: filas.length, movimientos: filas })
})
