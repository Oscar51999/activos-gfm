/** Exporta tablas a un .xlsx real (sin librerías): un ZIP sin compresión con las partes mínimas de Office Open XML. */
export type ColumnaExcel<T> = { titulo: string; valor: (f: T) => string | number | null | undefined; ancho?: number }

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
function crc32(b: Uint8Array) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Blob {
  const enc = new TextEncoder(), partes: Uint8Array[] = [], central: Uint8Array[] = []
  let off = 0
  for (const a of archivos) {
    const n = enc.encode(a.nombre), crc = crc32(a.datos), sz = a.datos.length
    const h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true)
    h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, n.length, true)
    partes.push(new Uint8Array(h.buffer), n, a.datos)
    const c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true)
    c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true)
    central.push(new Uint8Array(c.buffer), n)
    off += 30 + n.length + sz
  }
  const tamC = central.reduce((s, x) => s + x.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true); fin.setUint32(12, tamC, true); fin.setUint32(16, off, true)
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
function col(i: number) { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26) } return s }

export function libroExcel<T>(hojas: { nombre: string; titulo?: string; columnas: ColumnaExcel<T>[]; filas: T[] }[]): Blob {
  const enc = new TextEncoder(), arch: { nombre: string; datos: Uint8Array }[] = []
  const hojaXml = (h: typeof hojas[number]) => {
    let r = 1
    const filasXml: string[] = []
    if (h.titulo) { filasXml.push(`<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>${xml(h.titulo)}</t></is></c></row>`); r += 2 }
    const enc0 = r
    filasXml.push(`<row r="${r}">` + h.columnas.map((c, i) => `<c r="${col(i)}${r}" t="inlineStr" s="1"><is><t>${xml(c.titulo)}</t></is></c>`).join('') + '</row>'); r++
    for (const f of h.filas) {
      filasXml.push(`<row r="${r}">` + h.columnas.map((c, i) => {
        const v = c.valor(f), ref = `${col(i)}${r}`
        if (v == null || v === '') return ''
        return typeof v === 'number' && isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`
      }).join('') + '</row>'); r++
    }
    const ultima = col(Math.max(0, h.columnas.length - 1))
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
      + `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${enc0}" topLeftCell="A${enc0 + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      + `<cols>${h.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? Math.min(60, Math.max(10, c.titulo.length + 4, ...h.filas.slice(0, 200).map(f => String(c.valor(f) ?? '').length + 2)))}" customWidth="1"/>`).join('')}</cols>`
      + `<sheetData>${filasXml.join('')}</sheetData>`
      + (h.filas.length ? `<autoFilter ref="A${enc0}:${ultima}${enc0 + h.filas.length}"/>` : '')
      + `</worksheet>`
  }
  const nombres = hojas.map((h, i) => (h.nombre.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Hoja${i + 1}`))
  arch.push({ nombre: '[Content_Types].xml', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) })
  arch.push({ nombre: '_rels/.rels', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) })
  arch.push({ nombre: 'xl/workbook.xml', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) })
  arch.push({ nombre: 'xl/_rels/workbook.xml.rels', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) })
  arch.push({ nombre: 'xl/styles.xml', datos: enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1A3D7C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>`) })
  hojas.forEach((h, i) => arch.push({ nombre: `xl/worksheets/sheet${i + 1}.xml`, datos: enc.encode(hojaXml(h)) }))
  return zip(arch)
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
