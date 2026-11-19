import { supabase } from './supabase'
import { fotoProducto } from './logos'

export type Lectura = { marca: string | null; modelo: string | null; serie: string | null; categoria: string | null; descripcion: string | null; otros_textos?: string[]; confianza?: 'alta' | 'media' | 'baja'; foto?: string }

/** Manda la foto a la función `leer-etiqueta` y regresa lo que se alcanzó a leer. */
export async function leerEtiqueta(archivo: File): Promise<Lectura> {
  const imagen = await fotoProducto(archivo, 1400)
  const { data, error } = await supabase.functions.invoke('leer-etiqueta', { body: { imagen } })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return { ...(data as Lectura), foto: imagen }
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Busca en el catálogo el producto que coincide con lo leído (marca + modelo, tolerante a espacios y guiones). */
export function buscarProducto<T extends { nombre: string; marcas?: { nombre: string } | null }>(lista: T[], l: Lectura): T | null {
  const mo = norm(l.modelo), ma = norm(l.marca)
  if (!mo) return null
  const candidatos = lista.filter(p => { const n = norm(p.nombre); return n && (n === mo || n.includes(mo) || mo.includes(n)) })
  return candidatos.find(p => !ma || norm(p.marcas?.nombre) === ma) ?? (ma ? null : candidatos[0] ?? null)
}

export type EquipoLeido = { descripcion: string | null; marca: string | null; modelo: string | null; serie: string | null; numero_economico: string | null; placa: string | null; categoria: string | null; cantidad: number | null; notas: string | null }
export type DocumentoLeido = {
  tipo_documento: string | null; empresa: { razon_social: string | null; rfc: string | null } | null; proveedor: { nombre: string | null; rfc: string | null } | null
  folio: string | null; fecha: string | null; equipos: EquipoLeido[]; observaciones: string | null; confianza?: 'alta' | 'media' | 'baja'
}

const comoDataUrl = (f: File) => new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => mal(r.error); r.readAsDataURL(f) })

/** Alta inteligente: manda una factura, bitácora o foto (imagen o PDF) a `leer-documento` y regresa los equipos que trae. */
export async function leerDocumento(archivo: File, nota?: string): Promise<DocumentoLeido & { vista?: string }> {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
  if (esPdf && archivo.size > 10_000_000) throw new Error('El PDF pesa más de 10 MB; mándalo en partes o como foto.')
  const datos = esPdf ? (await comoDataUrl(archivo)).replace(/^data:[^;]*;/, 'data:application/pdf;') : await fotoProducto(archivo, 2000)
  const { data, error } = await supabase.functions.invoke('leer-documento', { body: { archivo: datos, nota } })
  if (error) {
    let msg = error.message
    try { const b = await (error as { context?: Response }).context?.json(); if (b?.error) msg = b.error } catch { /* sin detalle */ }
    throw new Error(msg)
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return { ...(data as DocumentoLeido), vista: esPdf ? undefined : datos }
}
