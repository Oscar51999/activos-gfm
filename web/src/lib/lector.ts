/**
 * Lector de documentos SIN IA (gratis, todo en el navegador):
 *  - XML de factura (CFDI 3.3 / 4.0): receptor, emisor, folio y conceptos, exacto.
 *  - PDF: saca el texto; si es escaneado, lo lee con OCR.
 *  - Fotos: OCR (Tesseract, español).
 *  - Excel (.xlsx), CSV y TXT: por encabezados (descripción, marca, modelo, serie, placa, cantidad…).
 * Con el texto, unas reglas arman la lista de equipos. Lo que no quede bien se corrige en pantalla.
 */
import type { DocumentoLeido, EquipoLeido } from './ia'

export type Lectura = DocumentoLeido & { metodo: 'xml' | 'pdf' | 'ocr' | 'excel' | 'texto'; rfcs: string[]; texto?: string }
type Avance = (msg: string) => void

const MARCAS = ['Lenovo', 'HP', 'Hewlett Packard', 'Dell', 'Apple', 'Samsung', 'Motorola', 'Kenwood', 'Hytera', 'Asus', 'Acer', 'Huawei', 'Xiaomi', 'Epson', 'Brother', 'Canon', 'Cisco', 'Ubiquiti', 'TP-Link', 'Hikvision', 'Dahua', 'Logitech', 'Microsoft', 'LG', 'BenQ', 'APC', 'CyberPower', 'Garmin',
  'Toyota', 'Nissan', 'Ford', 'Chevrolet', 'GMC', 'Dodge', 'RAM', 'Jeep', 'Kia', 'Hyundai', 'Mitsubishi', 'Volkswagen', 'Isuzu', 'Freightliner', 'International', 'Kenworth', 'Hino', 'Honda', 'Mazda',
  'Caterpillar', 'CAT', 'Komatsu', 'John Deere', 'JCB', 'Case', 'New Holland', 'Bobcat', 'Volvo', 'Doosan', 'Hyundai CE', 'Kubota', 'Takeuchi', 'Wacker Neuson', 'Bomag', 'Dynapac', 'Genie', 'JLG', 'Atlas Copco', 'Ingersoll Rand', 'Sullair', 'Generac', 'Cummins', 'Perkins',
  'Bosch', 'Makita', 'DeWalt', 'Milwaukee', 'Hilti', 'Truper', 'Stihl', 'Husqvarna', 'Black & Decker', 'Ryobi', 'Metabo', 'Urrea', 'Pretul', 'Lincoln Electric', 'Miller', 'Infra',
  'Leica', 'Trimble', 'Topcon', 'Sokkia', 'Spectra', 'South', 'Nikon', 'DJI']
const CATS: [RegExp, string][] = [
  [/\b(camioneta|pick ?up|autom[oó]vil|veh[ií]culo|cami[oó]n|tracto|chasis|sedan|vin\b|niv\b)/i, 'Vehículos'],
  [/\b(retroexcavadora|excavadora|motoconformadora|motoniveladora|compactador|vibrocompactador|rodillo|cargador frontal|minicargador|bulldozer|tractor|gr[uú]a|montacargas|pavimentadora|plataforma elevadora)/i, 'Maquinaria pesada'],
  [/\b(estaci[oó]n total|teodolito|nivel autom|nivel [oó]ptico|gps|gnss|receptor rtk|colectora|prisma|dron|drone)/i, 'Equipo de topografía'],
  [/\b(radio|celular|smartphone|tel[eé]fono|iphone|repetidor|antena|walkie)/i, 'Equipo de comunicación'],
  [/\b(laptop|computadora port[aá]til|notebook|computadora|cpu|desktop|monitor|impresora|multifuncional|tablet|ipad|servidor|no ?break|ups|switch|router|access point|disco duro|ssd|proyector|esc[aá]ner)/i, 'Equipo de cómputo'],
  [/\b(taladro|rotomartillo|esmeril|amoladora|sierra|pulidora|atornillador|demoledor|soldadora|cortadora|compresor|generador|planta de luz|bomba|vibrador|revolvedora)/i, 'Herramienta'],
  [/\b(silla|escritorio|archivero|mesa|librero|locker|anaquel|estante)/i, 'Mobiliario'],
]
const SERVICIO = /\b(flete|env[ií]o|servicio|instalaci[oó]n|mano de obra|garant[ií]a|licencia|suscripci[oó]n|mantenimiento|renta|arrendamiento|capacitaci[oó]n|anticipo|descuento|seguro|maniobra|cable|t[oó]ner|cartucho|papel)\b/i
const RE_SERIE = /(?:\bS\s?[/I1l|]\s?N\b|S\.N\.|\bSN\b|N[º°o]?\.?\s*(?:DE\s*)?SERIE|\bSERIE\b|\bSERIAL\b|IMEI|\bVIN\b|\bNIV\b)\s*[:#.\-]?\s*([A-Z0-9][A-Z0-9\-]{3,24})/gi
const RE_VIN = /\b([A-HJ-NPR-Z0-9]{17})\b/g
const RE_PLACA = /\bPLACAS?\s*[:#.\-]?\s*([A-Z0-9]{2,4}[\- ]?[A-Z0-9]{2,4}(?:[\- ]?[A-Z0-9]{1,3})?)/i
const RE_MODELO = /\bMOD(?:ELO)?\.?\s*[:#\-]?\s*([A-Z0-9][A-Z0-9\- /.]{1,24})/i
const RE_RFC = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/g
const PALABRA_SERIE = /^(?:DE|LA|EL|DEL|Y|CON|PARA|NUMERO|NO)$/i

const limpiar = (s: string) => s.replace(/\s+/g, ' ').trim()
export const categoriaPorTexto = (t: string) => CATS.find(([re]) => re.test(t))?.[1] ?? null

function marcaEn(t: string): string | null {
  const T = ` ${t.toUpperCase()} `
  const m = MARCAS.filter(x => new RegExp(`[^A-Z0-9]${x.toUpperCase().replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}[^A-Z0-9]`).test(T)).sort((a, b) => b.length - a.length)[0]
  return m ? (m === 'CAT' ? 'Caterpillar' : m === 'Hewlett Packard' ? 'HP' : m) : null
}
function seriesEn(t: string): string[] {
  const out = new Set<string>()
  for (const m of t.matchAll(RE_SERIE)) if (!PALABRA_SERIE.test(m[1]) && /\d/.test(m[1])) out.add(m[1].toUpperCase())
  if (/veh[ií]culo|camioneta|vin|niv|autom[oó]vil|cami[oó]n/i.test(t)) for (const m of t.toUpperCase().matchAll(RE_VIN)) if (/\d/.test(m[1]) && /[A-Z]/.test(m[1])) out.add(m[1])
  return [...out]
}
function modeloEn(t: string, marca: string | null): string | null {
  const m = t.match(RE_MODELO)
  if (m) return limpiar(m[1]).replace(/\s+(SERIE|S\/N|COLOR|MARCA).*$/i, '').slice(0, 30) || null
  if (marca) { // lo que sigue a la marca: "LENOVO THINKPAD E14 GEN 5 ..."
    const r = new RegExp(`${marca.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}\\s+([A-Z0-9][A-Za-z0-9\\-]*(?:\\s+(?!PULGADAS|PULG|GB|TB|COLOR|NEGR|BLANC)[A-Z0-9][A-Za-z0-9\\-]*){0,2})`, 'i').exec(t)
    if (r) return limpiar(r[1]).replace(/\s+\d+(?:\.\d+)?\s*$/, '').slice(0, 30)
  }
  return null
}
function descripcionDe(t: string): string {
  let d = limpiar(t.replace(RE_SERIE, ' ').replace(RE_PLACA, ' ').replace(/\b(marca|modelo|mod\.?)\s*[:\-]?/gi, ' '))
  d = d.replace(/^[\d.,]+\s*(pzas?|piezas?|pz|und|unidad(?:es)?|h87|e48|ea|pza\.?)?\s*/i, '')
  return d.length > 70 ? d.slice(0, 70).replace(/\s\S*$/, '') : d
}
/** Un renglón (concepto, línea de texto, fila) → uno o varios equipos (uno por serie). */
function equiposDe(texto: string, cantidad = 1, extra: Partial<EquipoLeido> = {}): EquipoLeido[] {
  const marca = extra.marca ?? marcaEn(texto)
  const series = extra.serie ? [extra.serie] : seriesEn(texto)
  const base: EquipoLeido = {
    descripcion: extra.descripcion ?? descripcionDe(texto), marca, modelo: extra.modelo ?? modeloEn(texto, marca), serie: null,
    numero_economico: extra.numero_economico ?? null, placa: extra.placa ?? texto.match(RE_PLACA)?.[1]?.toUpperCase() ?? null,
    categoria: extra.categoria ?? categoriaPorTexto(texto), cantidad, notas: null,
  }
  if (!series.length) return [base]
  return series.map(s => ({ ...base, serie: s, cantidad: 1 }))
}

// ───────────── XML de factura (CFDI) ─────────────
function leerCFDI(xml: string): Lectura {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('El XML está dañado o no es una factura.')
  const porNombre = (n: string) => [...doc.getElementsByTagName('*')].filter(e => e.localName === n)
  const comp = porNombre('Comprobante')[0]
  if (!comp) throw new Error('Este XML no es un CFDI (no trae Comprobante).')
  const emisor = porNombre('Emisor')[0], receptor = porNombre('Receptor')[0]
  const equipos: EquipoLeido[] = []
  for (const c of porNombre('Concepto')) {
    const desc = c.getAttribute('Descripcion') ?? ''
    const clave = c.getAttribute('ClaveProdServ') ?? '', unidad = c.getAttribute('ClaveUnidad') ?? ''
    // fuera servicios (claves 7x-9x, unidad E48) y renglones que claramente no son equipo
    if (unidad === 'E48' || /^(7[0-9]|8[0-9]|9[0-9])/.test(clave) || (SERVICIO.test(desc) && !categoriaPorTexto(desc))) continue
    const partes = [...c.getElementsByTagName('*')].filter(e => e.localName === 'Parte').map(p => p.getAttribute('Descripcion') ?? '').join(' ')
    const cant = Math.max(1, Math.round(Number(c.getAttribute('Cantidad') ?? '1')) || 1)
    const texto = `${desc} ${partes}`
    const es = equiposDe(texto, cant, { descripcion: descripcionDe(desc) })
    // si la factura trae menos series que piezas, deja el resto como cantidad sin serie
    const conSerie = es.filter(e => e.serie).length
    if (conSerie && conSerie < cant) es.push({ ...es[0], serie: null, cantidad: cant - conSerie })
    equipos.push(...es)
  }
  const folio = [comp.getAttribute('Serie'), comp.getAttribute('Folio')].filter(Boolean).join('-') || null
  return {
    metodo: 'xml', tipo_documento: 'factura', confianza: 'alta', observaciones: null, rfcs: [receptor?.getAttribute('Rfc') ?? ''].filter(Boolean),
    empresa: { razon_social: receptor?.getAttribute('Nombre') ?? null, rfc: receptor?.getAttribute('Rfc') ?? null },
    proveedor: { nombre: emisor?.getAttribute('Nombre') ?? null, rfc: emisor?.getAttribute('Rfc') ?? null },
    folio, fecha: (comp.getAttribute('Fecha') ?? '').slice(0, 10) || null, equipos,
  }
}

// ───────────── Texto libre (PDF, OCR, TXT) ─────────────
export function equiposDeTexto(texto: string): Lectura {
  const lineas = texto.split(/\r?\n/).map(limpiar).filter(l => l.length > 2)
  const equipos: EquipoLeido[] = []
  const usadas = new Set<number>()
  lineas.forEach((l, i) => {
    if (usadas.has(i)) return
    const cat = categoriaPorTexto(l), marca = marcaEn(l)
    if (!cat && !marca) return
    if (SERVICIO.test(l) && !cat) return
    if (/^(r\.?f\.?c|subtotal|total|iva|importe|forma de pago|uso cfdi|r[eé]gimen|fecha|folio|cliente|domicilio)/i.test(l)) return
    // la serie a veces viene en la(s) línea(s) siguiente(s)
    let bloque = l
    for (let k = 1; k <= 2 && i + k < lineas.length; k++) {
      const sig = lineas[i + k]
      if (categoriaPorTexto(sig) || marcaEn(sig)) break
      if (/S\/N|SERIE|SERIAL|IMEI|VIN|NIV|MODELO|PLACA/i.test(sig)) { bloque += ' ' + sig; usadas.add(i + k) }
    }
    const cant = Number(l.match(/^(\d{1,3})(?:[.,]0+)?\s+(?:pzas?|piezas?|pz|und|unidad|h87|ea|pza)?/i)?.[1] ?? 1) || 1
    equipos.push(...equiposDe(bloque, cant))
  })
  // documento de un solo equipo (foto de etiqueta): todo el texto es un equipo
  if (!equipos.length) { const s = seriesEn(texto); if (s.length || marcaEn(texto)) equipos.push(...equiposDe(texto.slice(0, 400))) }
  const rfcs = [...new Set([...texto.toUpperCase().matchAll(RE_RFC)].map(m => m[1]))]
  const folio = texto.match(/\bfolio\s*(?:fiscal)?\s*[:#]?\s*([A-Z]{0,4}[\- ]?\d{1,10})\b/i)?.[1] ?? null
  const fecha = texto.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/)?.slice(1).join('-') ?? (() => { const m = texto.match(/\b(\d{2})[-/](\d{2})[-/](20\d{2})\b/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null })()
  const tipo = /factura|cfdi|comprobante fiscal/i.test(texto) ? 'factura' : /bit[aá]cora/i.test(texto) ? 'bitacora' : /remisi[oó]n/i.test(texto) ? 'remision' : 'lista'
  return { metodo: 'texto', tipo_documento: tipo, empresa: null, proveedor: null, folio, fecha, equipos, observaciones: null, confianza: equipos.length ? 'media' : 'baja', rfcs, texto }
}

// ───────────── Excel / CSV ─────────────
const COLS: Record<keyof EquipoLeido | 'ignorar', RegExp> = {
  descripcion: /descrip|equipo|art[ií]culo|concepto|producto|nombre|tipo/i, marca: /marca/i, modelo: /modelo/i, serie: /serie|s\/n|serial|imei|vin|niv/i,
  numero_economico: /econ[oó]mico|no\.? eco|n[uú]m\.? eco|inventario|activo/i, placa: /placa/i, categoria: /categor|clase|familia/i, cantidad: /cant|piezas|pzas|unidades/i, notas: /nota|observ|coment/i, ignorar: /^$/,
}
function equiposDeTabla(filas: string[][]): Lectura {
  const iEnc = filas.findIndex(f => f.filter(c => Object.values(COLS).some(re => re.test(c))).length >= 2)
  if (iEnc < 0) return equiposDeTexto(filas.map(f => f.join(' ')).join('\n'))
  const enc = filas[iEnc]
  const col = (k: keyof EquipoLeido) => enc.findIndex(c => COLS[k].test(c) && !(k === 'descripcion' && /marca|modelo|serie/i.test(c)))
  const ix = { descripcion: col('descripcion'), marca: col('marca'), modelo: col('modelo'), serie: col('serie'), numero_economico: col('numero_economico'), placa: col('placa'), categoria: col('categoria'), cantidad: col('cantidad'), notas: col('notas') }
  const v = (f: string[], i: number) => (i >= 0 ? limpiar(f[i] ?? '') : '') || null
  const equipos: EquipoLeido[] = []
  for (const f of filas.slice(iEnc + 1)) {
    if (!f.some(c => c && c.trim())) continue
    const desc = v(f, ix.descripcion) ?? [v(f, ix.marca), v(f, ix.modelo)].filter(Boolean).join(' ')
    if (!desc) continue
    const texto = f.join(' ')
    equipos.push({
      descripcion: desc, marca: v(f, ix.marca) ?? marcaEn(texto), modelo: v(f, ix.modelo), serie: v(f, ix.serie)?.toUpperCase() ?? null,
      numero_economico: v(f, ix.numero_economico), placa: v(f, ix.placa)?.toUpperCase() ?? null, categoria: v(f, ix.categoria) ?? categoriaPorTexto(texto),
      cantidad: Math.max(1, Math.round(Number(v(f, ix.cantidad) ?? 1)) || 1), notas: v(f, ix.notas),
    })
  }
  return { metodo: 'excel', tipo_documento: 'lista', empresa: null, proveedor: null, folio: null, fecha: null, equipos, observaciones: null, confianza: 'alta', rfcs: [] }
}
function csv(t: string): string[][] {
  const sep = (t.split('\n')[0].match(/;/g)?.length ?? 0) > (t.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : t.includes('\t') ? '\t' : ','
  const filas: string[][] = []; let f: string[] = [], c = '', q = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) { if (ch === '"' && t[i + 1] === '"') { c += '"'; i++ } else if (ch === '"') q = false; else c += ch }
    else if (ch === '"') q = true
    else if (ch === sep) { f.push(c); c = '' }
    else if (ch === '\n') { f.push(c.replace(/\r$/, '')); filas.push(f); f = []; c = '' }
    else c += ch
  }
  if (c || f.length) { f.push(c); filas.push(f) }
  return filas
}
/** .xlsx sin librerías: abre el ZIP con DecompressionStream y lee la primera hoja. */
async function xlsx(buf: ArrayBuffer): Promise<string[][]> {
  const u8 = new Uint8Array(buf), dv = new DataView(buf)
  let fin = u8.length - 22; while (fin > 0 && dv.getUint32(fin, true) !== 0x06054b50) fin--
  const n = dv.getUint16(fin + 10, true); let p = dv.getUint32(fin + 16, true)
  const archivos = new Map<string, () => Promise<string>>()
  for (let i = 0; i < n; i++) {
    const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true)
    const nombre = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + ln))
    archivos.set(nombre, async () => {
      const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), datos = u8.slice(ini, ini + tam)
      if (metodo === 0) return new TextDecoder().decode(datos)
      const s = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
      return new Response(s).text()
    })
    p += 46 + ln + le + lc
  }
  const leer = (k: string) => archivos.get(k)?.() ?? Promise.resolve('')
  const comp = (await leer('xl/sharedStrings.xml'))
  const dom = (x: string) => new DOMParser().parseFromString(x, 'application/xml')
  const compartidas = [...dom(comp || '<sst/>').getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''))
  const hoja = [...archivos.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0]
  if (!hoja) throw new Error('El Excel no trae hojas.')
  const filas: string[][] = []
  for (const r of dom(await leer(hoja)).getElementsByTagName('row')) {
    const f: string[] = []
    for (const c of r.getElementsByTagName('c')) {
      const ref = c.getAttribute('r') ?? '', colL = ref.replace(/\d+/g, '')
      const idx = [...colL].reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0) - 1
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? c.getElementsByTagName('t')[0]?.textContent ?? ''
      f[idx] = t === 's' ? compartidas[Number(v)] ?? '' : v
    }
    filas.push([...f].map(x => x ?? ''))
  }
  return filas
}

// ───────────── PDF y OCR ─────────────
async function pdfTexto(buf: ArrayBuffer, avance: Avance): Promise<{ texto: string; paginas: HTMLCanvasElement[] }> {
  avance('Abriendo el PDF…')
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  let texto = ''
  const total = Math.min(pdf.numPages, 15)
  for (let i = 1; i <= total; i++) {
    const pg = await pdf.getPage(i)
    const tc = await pg.getTextContent()
    // reconstruye renglones por posición vertical
    const items = (tc.items as { str: string; transform: number[] }[]).filter(x => 'str' in x)
    const porY = new Map<number, { x: number; s: string }[]>()
    for (const it of items) { const y = Math.round(it.transform[5] / 3) * 3; porY.set(y, [...(porY.get(y) ?? []), { x: it.transform[4], s: it.str }]) }
    texto += [...porY.entries()].sort((a, b) => b[0] - a[0]).map(([, xs]) => xs.sort((a, b) => a.x - b.x).map(x => x.s).join(' ')).join('\n') + '\n'
  }
  const paginas: HTMLCanvasElement[] = []
  if (texto.replace(/\s/g, '').length < 40) { // escaneado: se renderiza para OCR
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 2 })
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height
      await pg.render({ canvasContext: cv.getContext('2d')!, viewport: vp }).promise
      paginas.push(cv)
    }
  }
  return { texto, paginas }
}
async function ocr(imagenes: (File | HTMLCanvasElement)[], avance: Avance): Promise<string> {
  avance('Preparando el lector de texto (la primera vez tarda un poco)…')
  const { createWorker } = await import('tesseract.js')
  const w = await createWorker('spa', 1, { logger: m => { if (m.status === 'recognizing text') avance(`Leyendo texto… ${Math.round(m.progress * 100)}%`) } })
  let texto = ''
  try { for (const im of imagenes) texto += (await w.recognize(im)).data.text + '\n' } finally { await w.terminate() }
  return texto
}

/** Lee cualquier archivo y regresa los equipos que encuentre. */
export async function leerArchivo(f: File, avance: Avance = () => {}): Promise<Lectura & { vista?: string }> {
  const nombre = f.name.toLowerCase()
  if (nombre.endsWith('.xlsx') || f.type.includes('spreadsheetml')) { avance('Leyendo Excel…'); return equiposDeTabla(await xlsx(await f.arrayBuffer())) }
  if (nombre.endsWith('.xml') || f.type === 'text/xml' || f.type === 'application/xml') { avance('Leyendo XML…'); return leerCFDI(await f.text()) }
  if (nombre.endsWith('.xls')) throw new Error('Guarda el Excel como .xlsx (Archivo → Guardar como) y vuelve a subirlo.')
  if (nombre.endsWith('.csv')) return equiposDeTabla(csv(await f.text()))
  if (nombre.endsWith('.txt') || f.type.startsWith('text/')) return { ...equiposDeTexto(await f.text()) }
  if (nombre.endsWith('.pdf') || f.type === 'application/pdf') {
    const { texto, paginas } = await pdfTexto(await f.arrayBuffer(), avance)
    if (!paginas.length) return { ...equiposDeTexto(texto), metodo: 'pdf' }
    return { ...equiposDeTexto(await ocr(paginas, avance)), metodo: 'ocr' }
  }
  if (f.type.startsWith('image/')) {
    const r = { ...equiposDeTexto(await ocr([f], avance)), metodo: 'ocr' as const }
    return { ...r, vista: URL.createObjectURL(f) }
  }
  throw new Error('Formato no soportado. Sube XML, PDF, foto, Excel (.xlsx), CSV o TXT.')
}

/** Lee la primera hoja de un .xlsx (o un .csv/.txt) como tabla de texto, para importar catálogos. */
export async function leerTabla(f: File): Promise<string[][]> {
  const nombre = f.name.toLowerCase()
  if (nombre.endsWith('.xlsx') || f.type.includes('spreadsheetml')) return xlsx(await f.arrayBuffer())
  if (nombre.endsWith('.xls')) throw new Error('Guarda el Excel como .xlsx (Archivo → Guardar como) y vuelve a subirlo.')
  if (nombre.endsWith('.csv') || nombre.endsWith('.txt') || f.type.startsWith('text/')) return csv(await f.text())
  throw new Error('Sube un Excel (.xlsx) o CSV.')
}
