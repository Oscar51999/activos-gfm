/* Etiquetas para impresoras térmicas y RFID en lenguaje ZPL (Zebra; también lo entienden muchas TSC, Honeywell y SATO en modo emulación). */

export type Formato = { id: string; nombre: string; anchoMm: number; altoMm: number }
export const FORMATOS: Formato[] = [
  { id: '50x25', nombre: '50 × 25 mm', anchoMm: 50, altoMm: 25 },
  { id: '50x30', nombre: '50 × 30 mm', anchoMm: 50, altoMm: 30 },
  { id: '2x1', nombre: '2 × 1 pulg (51 × 25 mm)', anchoMm: 50.8, altoMm: 25.4 },
  { id: '60x40', nombre: '60 × 40 mm', anchoMm: 60, altoMm: 40 },
  { id: '4x2', nombre: '4 × 2 pulg (102 × 51 mm)', anchoMm: 101.6, altoMm: 50.8 },
  { id: '100x50', nombre: '100 × 50 mm', anchoMm: 100, altoMm: 50 },
]

export type DatosEtiqueta = { url: string; codigo: string; linea1: string; linea2?: string; pie?: string; epc?: string | null }

/** Quita caracteres que rompen ZPL (^ y ~ son comandos). */
const limpio = (t: string) => t.replace(/[\^~]/g, ' ').replace(/\s+/g, ' ').trim()

/** Una etiqueta en ZPL. Con `rfid`, además graba el EPC en el chip (^RFW) antes de imprimir. */
export function zplEtiqueta(d: DatosEtiqueta, f: Formato, dpi: 203 | 300 = 203, rfid = false) {
  const dpmm = dpi === 300 ? 12 : 8
  const w = Math.round(f.anchoMm * dpmm), h = Math.round(f.altoMm * dpmm)
  const m = Math.round(1.5 * dpmm)                       // margen
  const mag = Math.max(2, Math.min(10, Math.floor((h - 2 * m) / 37)))   // URL corta ≈ QR versión 4 (33 módulos + zona)
  const qr = 33 * mag
  const x = m + qr + Math.round(2 * dpmm)               // texto a la derecha del QR
  const anchoTxt = w - x - m
  const t1 = Math.round(h * 0.16), t2 = Math.round(h * 0.11)
  const lineas = [
    rfid && d.epc ? `^RS8^RFW,H,,,A^FD${d.epc}^FS` : '',
    `^FO${m},${m}^BQN,2,${mag}^FDLA,${d.url}^FS`,
    `^FO${x},${m}^A0N,${t1},${t1}^FB${anchoTxt},1,0,L^FD${limpio(d.codigo)}^FS`,
    `^FO${x},${m + t1 + 4}^A0N,${t2},${t2}^FB${anchoTxt},2,2,L^FD${limpio(d.linea1)}^FS`,
    d.linea2 ? `^FO${x},${m + t1 + 2 * t2 + 12}^A0N,${t2},${t2}^FB${anchoTxt},1,0,L^FD${limpio(d.linea2)}^FS` : '',
    d.pie ? `^FO${x},${h - m - t2}^A0N,${Math.round(t2 * 0.9)},${Math.round(t2 * 0.9)}^FB${anchoTxt},1,0,L^FD${limpio(d.pie)}^FS` : '',
  ].filter(Boolean)
  return ['^XA', '^CI28', `^PW${w}`, `^LL${h}`, '^LH0,0', ...lineas, '^PQ1', '^XZ'].join('\n')
}

/** Envía ZPL a la impresora predeterminada con Zebra Browser Print (programa gratuito de Zebra instalado en la PC). */
export async function enviarABrowserPrint(zpl: string): Promise<string> {
  const bases = ['https://localhost:9101', 'http://localhost:9100']
  let ultimo = ''
  for (const b of bases) {
    try {
      const r = await fetch(`${b}/default?type=printer`, { method: 'GET' })
      if (!r.ok) { ultimo = `respuesta ${r.status}`; continue }
      const dispositivo = await r.json()
      if (!dispositivo?.name) { ultimo = 'no hay impresora predeterminada en Browser Print'; continue }
      const w = await fetch(`${b}/write`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: dispositivo, data: zpl }) })
      if (!w.ok) throw new Error(`la impresora respondió ${w.status}`)
      return dispositivo.name as string
    } catch (e) { ultimo = (e as Error).message }
  }
  throw new Error(`No encontré Zebra Browser Print en esta computadora (${ultimo}). Instálalo y elige tu impresora como predeterminada, o descarga el archivo .zpl.`)
}

/** Descarga un archivo de texto (ZPL) para mandarlo a la impresora con su utilidad. */
export function descargarTexto(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
