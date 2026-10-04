import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Printer } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { urlQR } from '../lib/qr'
import { Cargando, Aviso } from '../components/ui'
import type { ActivoFila } from './Activos'
import { MonogramaFirme } from '../components/Logo'

type Tam = 'chica' | 'grande'

export default function Etiquetas() {
  const [sp] = useSearchParams()
  const [filas, setFilas] = useState<ActivoFila[] | null>(null)
  const [error, setError] = useState('')
  const [tam, setTam] = useState<Tam>('chica')

  useEffect(() => {
    let q = supabase.from('v_activos').select('*').order('codigo')
    const ids = sp.get('ids')
    if (ids) q = q.in('id', ids.split(','))
    else {
      if (sp.get('empresa')) q = q.eq('empresa_id', sp.get('empresa')!)
      if (sp.get('categoria')) q = q.eq('categoria_id', sp.get('categoria')!)
      if (sp.get('ubicacion')) q = q.eq('ubicacion_id', sp.get('ubicacion')!)
      if (sp.get('estatus')) q = q.eq('estatus', sp.get('estatus')!)
    }
    q.limit(500).then(({ data, error }) => {
      if (error) setError(mensajeError(error))
      setFilas((data as ActivoFila[]) ?? [])
    })
  }, [sp])

  if (error) return <Aviso>{error}</Aviso>
  if (!filas) return <Cargando />

  const g = tam === 'chica'
    ? { grid: 'grid-cols-3', qr: 72, caja: 'h-[1.25in] p-2', txt: 'text-[9px]' }
    : { grid: 'grid-cols-2', qr: 120, caja: 'h-[2in] p-3', txt: 'text-[11px]' }

  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/activos" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />Activos</Link>
          <h1 className="text-2xl font-semibold">Etiquetas QR</h1>
          <p className="text-sm text-stone-500">{filas.length} etiqueta(s){filas.length === 500 ? ' (máximo 500 por impresión; filtra para imprimir el resto)' : ''}. Hoja carta; recorta o usa hojas de etiquetas adhesivas.</p>
        </div>
        <div className="flex gap-2">
          <select className="campo w-auto" value={tam} onChange={e => setTam(e.target.value as Tam)}>
            <option value="chica">Chica (3 por fila)</option><option value="grande">Grande (2 por fila)</option>
          </select>
          <button className="btn-primario" onClick={() => window.print()}><Printer size={16} />Imprimir</button>
        </div>
      </div>

      <div className={`papel grid ${g.grid} gap-2 rounded-xl bg-white p-2 print:p-0`}>
        {filas.map(a => (
          <div key={a.id} className={`flex items-center gap-2 rounded border border-stone-300 ${g.caja} break-inside-avoid`}>
            <QRCodeSVG value={urlQR(a.qr)} size={g.qr} level="M" marginSize={0} className="shrink-0" />
            <div className={`min-w-0 leading-tight ${g.txt}`}>
              <div className="mb-1 flex items-center gap-1">
                <MonogramaFirme className="h-[1.3em] w-auto shrink-0 text-black" />
                <span className="truncate text-stone-500">{a.empresa}</span>
              </div>
              <p className="font-mono text-[1.25em] font-bold">{a.codigo}</p>
              <p className="line-clamp-2">{a.descripcion}</p>
              {(a.numero_economico || a.serie) && <p className="truncate text-stone-500">{a.numero_economico ? `No. ${a.numero_economico}` : `S/N ${a.serie}`}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
