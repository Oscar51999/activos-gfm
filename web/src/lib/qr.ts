/** URL que va dentro de la etiqueta QR: abre la ficha del activo al escanearla con cualquier celular. */
export function urlQR(qr: string) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '')
  return `${base}#/q/${qr}`
}

/** Extrae el identificador QR de un texto escaneado (URL completa o solo el uuid). */
export function leerQR(texto: string): string | null {
  if (leerPosicion(texto)) return null
  const m = texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0].toLowerCase() : null
}

/** EPC de una etiqueta RFID (96 bits = 24 caracteres hexadecimales). Los lectores de mano lo “teclean” como texto. */
export const esEPC = (texto: string) => /^[0-9A-F]{24}$/i.test(texto.trim())
/** EPC que el sistema graba en la etiqueta RFID de un activo: "47464D" (GFM) + número del código en hexadecimal. */
export function epcDeCodigo(codigo: string) {
  const n = Number((codigo.match(/\d+/) ?? ['0'])[0])
  return '47464D' + n.toString(16).toUpperCase().padStart(18, '0')
}

type Identificable = { qr?: string | null; codigo: string; numero_economico?: string | null; serie?: string | null; rfid_epc?: string | null }
/** ¿Lo leído (QR, RFID, código, No. económico o serie) corresponde a este activo? */
export function coincideLectura(a: Identificable, texto: string) {
  const t = texto.trim(), up = t.toUpperCase()
  const qr = leerQR(t)
  if (qr) return a.qr === qr
  if (esEPC(t)) return (a.rfid_epc ?? epcDeCodigo(a.codigo)).toUpperCase() === up
  return a.codigo === up || a.numero_economico?.toUpperCase() === up || a.serie?.toUpperCase() === up
}
/** Separa varias lecturas pegadas de golpe (un lector RFID puede leer decenas de etiquetas a la vez). */
export const separarLecturas = (texto: string) => [...new Set(texto.split(/[\r\n\t,;]+/).map(x => x.trim()).filter(Boolean))]

/** Etiqueta de posición de almacén (rack/nivel): su QR lleva "POS:<id>". */
export function leerPosicion(texto: string): string | null {
  const m = texto.trim().match(/^POS:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)
  return m ? m[1].toLowerCase() : null
}
