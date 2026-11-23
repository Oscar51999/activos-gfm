/** Etiquetas NFC (stickers): el lector USB/Bluetooth "teclea" el número del chip; en Android, Chrome lo lee con el celular. */

/** Quita separadores y deja mayúsculas: "04:a2:b3…" → "04A2B3…". */
export const normalNfc = (t: string) => t.replace(/[^0-9a-z]/gi, '').toUpperCase()

/** ¿El texto parece el número de un chip NFC? (4, 7 o 10 bytes en hexadecimal, o el decimal que mandan algunos lectores) */
export function pareceNfc(t: string) {
  const s = normalNfc(t)
  return /^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(s) || /^\d{8,10}$/.test(s) || /^\d{15,17}$/.test(s)
}

const hex = (n: bigint, bytes: number) => n.toString(16).toUpperCase().padStart(bytes * 2, '0')
const invertir = (h: string) => (h.match(/../g) ?? []).reverse().join('')

/**
 * Todas las formas en que puede llegar el mismo chip: tal cual, con los bytes al revés,
 * y si el lector lo manda en decimal (muy común en lectores tipo teclado), su equivalente en hexadecimal.
 */
export function formasNfc(t: string): string[] {
  const s = normalNfc(t)
  if (!s) return []
  const out = new Set([s])
  if (/^[0-9A-F]+$/.test(s) && s.length % 2 === 0 && /[A-F]|^.{8}$|^.{14}$/.test(s)) {
    out.add(invertir(s))
    // y su versión en decimal (por si se ligó con un lector que "teclea" números)
    for (const h of [s, invertir(s)]) { const d = BigInt('0x' + h).toString(); out.add(d); out.add(d.padStart(10, '0')) }
  }
  if (/^\d+$/.test(s)) {
    try {
      const n = BigInt(s)
      for (const b of [4, 7]) { if (n < 1n << BigInt(b * 8)) { const h = hex(n, b); out.add(h); out.add(invertir(h)) } }
    } catch { /* no es número */ }
  }
  return [...out]
}

/** ¿El celular puede leer NFC desde Chrome? (Android con NFC activado) */
export const hayNfcCelular = () => typeof window !== 'undefined' && 'NDEFReader' in window

type NDEFReaderT = { scan: (o?: { signal?: AbortSignal }) => Promise<void>; write: (m: unknown, o?: { signal?: AbortSignal }) => Promise<void>; onreading: ((e: { serialNumber: string; message: { records: { recordType: string; data?: DataView }[] } }) => void) | null; onreadingerror: (() => void) | null }

/** Lee una etiqueta con el NFC del celular. Regresa una función para cancelar. */
export function leerConCelular(onLeer: (uid: string, texto: string | null) => void, onError: (m: string) => void): () => void {
  const ctrl = new AbortController()
  try {
    const r = new (window as unknown as { NDEFReader: new () => NDEFReaderT }).NDEFReader()
    r.onreading = e => {
      let texto: string | null = null
      for (const rec of e.message?.records ?? []) if ((rec.recordType === 'url' || rec.recordType === 'text') && rec.data) { texto = new TextDecoder().decode(rec.data); break }
      onLeer(normalNfc(e.serialNumber ?? ''), texto)
    }
    r.onreadingerror = () => onError('No se pudo leer la etiqueta. Acércala otra vez.')
    r.scan({ signal: ctrl.signal }).catch((err: Error) => onError(err.name === 'NotAllowedError' ? 'Da permiso de NFC al navegador.' : 'Activa el NFC del celular e inténtalo de nuevo.'))
  } catch { onError('Este navegador no lee NFC. Usa Chrome en Android o el lector USB.') }
  return () => ctrl.abort()
}

/** Graba el enlace del activo dentro del sticker: cualquier celular que lo toque abre su ficha. */
export async function grabarEnlace(url: string) {
  const r = new (window as unknown as { NDEFReader: new () => NDEFReaderT }).NDEFReader()
  await r.write({ records: [{ recordType: 'url', data: url }] })
}
