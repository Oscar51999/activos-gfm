/** URL que va dentro de la etiqueta QR: abre la ficha del activo al escanearla con cualquier celular. */
export function urlQR(qr: string) {
  const base = window.location.origin + window.location.pathname.replace(/index\.html$/, '')
  return `${base}#/q/${qr}`
}

/** Extrae el identificador QR de un texto escaneado (URL completa o solo el uuid). */
export function leerQR(texto: string): string | null {
  const m = texto.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return m ? m[0].toLowerCase() : null
}
