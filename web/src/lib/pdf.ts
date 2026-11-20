/** PDF de tablas (reportes) con encabezado del Departamento de TICS. Se carga solo cuando se usa. */
export type ColumnaPdf<T> = { titulo: string; valor: (f: T) => string | number | null | undefined; ancho?: number }

export async function pdfTabla<T>(o: {
  titulo: string; subtitulo?: string; columnas: ColumnaPdf<T>[]; filas: T[]; nombre: string; horizontal?: boolean
  grupos?: { titulo: string; filas: T[] }[]   // si viene, imprime una tabla por grupo
  colorFila?: (f: T) => [number, number, number] | null
}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: o.horizontal ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth()
  const ambar: [number, number, number] = [226, 166, 75]
  const fecha = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })

  const encabezado = () => {
    doc.setFillColor(...ambar); doc.rect(0, 0, W, 6, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(120)
    doc.text('GRUPO EMPRESARIAL FIRME · DEPARTAMENTO DE TICS', 36, 26)
    doc.setFont('helvetica', 'normal'); doc.text(fecha, W - 36, 26, { align: 'right' })
  }
  encabezado()
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(25); doc.text(o.titulo, 36, 54)
  let y = 60
  if (o.subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100); doc.text(doc.splitTextToSize(o.subtitulo, W - 72), 36, 72); y = 80 }

  const cuerpo = (fs: T[]) => fs.map(f => o.columnas.map(c => { const v = c.valor(f); return v == null ? '' : String(v) }))
  const anchos = Object.fromEntries(o.columnas.map((c, i) => [i, c.ancho ? { cellWidth: c.ancho } : {}]))
  const tabla = (fs: T[], inicio: number) => autoTable(doc, {
    startY: inicio, head: [o.columnas.map(c => c.titulo)], body: cuerpo(fs), margin: { left: 36, right: 36, top: 40 },
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: 30, lineColor: 225, lineWidth: 0.5, overflow: 'linebreak' },
    headStyles: { fillColor: [28, 31, 36], textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 247, 244] },
    columnStyles: anchos,
    didParseCell: d => { if (d.section === 'body' && o.colorFila) { const c = o.colorFila(fs[d.row.index]); if (c && d.column.index === 0) { d.cell.styles.textColor = c; d.cell.styles.fontStyle = 'bold' } } },
    didDrawPage: () => encabezado(),
  })
  const ultimo = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y

  if (o.grupos) {
    let inicio = y + 6
    for (const g of o.grupos) {
      if (!g.filas.length) continue
      if (inicio > doc.internal.pageSize.getHeight() - 90) { doc.addPage(); inicio = 50 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(25); doc.text(`${g.titulo} (${g.filas.length})`, 36, inicio + 10)
      tabla(g.filas, inicio + 16); inicio = ultimo() + 20
    }
  } else tabla(o.filas, y + 6)

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text(`Página ${i} de ${n}`, W - 36, doc.internal.pageSize.getHeight() - 18, { align: 'right' }) }
  doc.save(o.nombre.endsWith('.pdf') ? o.nombre : `${o.nombre}.pdf`)
}
