import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Printer, Radio, Send, Download, FileText, Ticket, Info } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { urlQR, epcDeCodigo } from '../lib/qr'
import { FORMATOS, zplEtiqueta, enviarABrowserPrint, descargarTexto, type DatosEtiqueta } from '../lib/zpl'
import { Cargando, Aviso } from '../components/ui'
import type { ActivoFila } from './Activos'
import { MonogramaFirme } from '../components/Logo'

type Modo = 'hoja' | 'termica' | 'rfid'
type Item = DatosEtiqueta & { id: string; empresa: string }
const leer = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const guardar = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sin almacenamiento */ } }

/** Etiquetas de activos (o de posiciones de almacén): hoja carta, impresora de tickets térmica o impresora RFID (ZPL). */
export default function Etiquetas() {
  const [sp] = useSearchParams()
  const esPos = sp.get('tipo') === 'posiciones'
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState('')
  const [modo, setModo] = useState<Modo>(() => (leer('gfm.etq.modo') as Modo) || 'hoja')
  const [tam, setTam] = useState<'chica' | 'grande'>('chica')
  const [fmt, setFmt] = useState(() => leer('gfm.etq.fmt') || '50x25')
  const [dpi, setDpi] = useState<203 | 300>(() => (Number(leer('gfm.etq.dpi')) === 300 ? 300 : 203))
  const [rfid, setRfid] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => { guardar('gfm.etq.modo', modo); guardar('gfm.etq.fmt', fmt); guardar('gfm.etq.dpi', String(dpi)) }, [modo, fmt, dpi])

  useEffect(() => {
    if (esPos) {
      let q = supabase.from('posiciones').select('id,codigo,descripcion,ubicaciones(nombre),empresas(nombre_corto,nombre)').eq('activo', true).order('codigo')
      if (sp.get('ubicacion')) q = q.eq('ubicacion_id', sp.get('ubicacion')!)
      if (sp.get('ids')) q = q.in('id', sp.get('ids')!.split(','))
      q.limit(1000).then(({ data, error }) => {
        if (error) setError(mensajeError(error))
        setItems(((data ?? []) as unknown as { id: string; codigo: string; descripcion: string | null; ubicaciones: { nombre: string } | null; empresas: { nombre_corto: string | null; nombre: string } | null }[])
          .map(p => ({ id: p.id, url: `POS:${p.id}`, codigo: p.codigo, linea1: p.ubicaciones?.nombre ?? '', linea2: p.descripcion ?? 'Posición de almacén', empresa: p.empresas?.nombre_corto || p.empresas?.nombre || '', epc: null })))
      })
      return
    }
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
      setItems(((data as (ActivoFila & { rfid_epc?: string | null })[]) ?? []).map(a => ({
        id: a.id, url: urlQR(a.qr), codigo: a.codigo, linea1: [a.marca, a.modelo].filter(Boolean).join(' ') || a.descripcion,
        linea2: a.numero_economico ? `No. ${a.numero_economico}` : a.serie ? `S/N ${a.serie}` : undefined, pie: a.empresa, empresa: a.empresa, epc: a.rfid_epc || epcDeCodigo(a.codigo),
      })))
    })
  }, [sp, esPos])

  const formato = FORMATOS.find(f => f.id === fmt) ?? FORMATOS[0]
  const zpl = useMemo(() => (items ?? []).map(i => zplEtiqueta(i, formato, dpi, rfid && !esPos)).join('\n'), [items, formato, dpi, rfid, esPos])

  async function enviar() {
    setMsg(null); setEnviando(true)
    try { const n = await enviarABrowserPrint(zpl); setMsg({ ok: true, t: `${items!.length} etiqueta(s) enviadas a ${n}.` }) }
    catch (e) { setMsg({ ok: false, t: (e as Error).message }) } finally { setEnviando(false) }
  }

  if (error) return <Aviso>{error}</Aviso>
  if (!items) return <Cargando />
  const g = tam === 'chica' ? { grid: 'grid-cols-3', qr: 72, caja: 'h-[1.25in] p-2', txt: 'text-[9px]' } : { grid: 'grid-cols-2', qr: 120, caja: 'h-[2in] p-3', txt: 'text-[11px]' }
  const qrMm = Math.min(formato.altoMm - 3, formato.anchoMm * 0.45)

  return (
    <div>
      {modo === 'termica' && <style>{`@media print { @page { size: ${formato.anchoMm}mm ${formato.altoMm}mm; margin: 0 } body * { visibility: hidden } #etq-termicas, #etq-termicas * { visibility: visible } #etq-termicas { position: absolute; inset: 0 auto auto 0; gap: 0 !important; padding: 0 !important; background: #fff } .etq-term { border: 0 !important; border-radius: 0 !important; break-after: page; page-break-after: always } }`}</style>}
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={esPos ? '/posiciones' : '/activos'} className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta"><ArrowLeft size={15} />{esPos ? 'Posiciones' : 'Activos'}</Link>
          <h1 className="text-2xl font-semibold">{esPos ? 'Etiquetas de posiciones' : 'Etiquetas QR y RFID'}</h1>
          <p className="text-sm text-stone-500">{items.length} etiqueta(s){items.length === 500 ? ' (máximo 500 por impresión)' : ''}.</p>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
          {([['hoja', 'Hoja carta', FileText], ['termica', 'Impresora de tickets', Ticket], ['rfid', esPos ? 'ZPL (Zebra)' : 'RFID (ZPL)', Radio]] as const).map(([k, t, I]) => (
            <button key={k} onClick={() => setModo(k)} className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition sm:text-sm ${modo === k ? 'bg-marca text-[#120D04]' : 'text-stone-500 hover:text-tinta'}`}><I size={15} />{t}</button>
          ))}
        </div>
      </div>

      <div className="no-print tarjeta mb-6 flex flex-wrap items-end gap-3 p-4">
        {modo === 'hoja' ? (
          <label className="text-sm"><span className="etiqueta">Tamaño</span><select className="campo w-auto" value={tam} onChange={e => setTam(e.target.value as 'chica' | 'grande')}><option value="chica">Chica (3 por fila)</option><option value="grande">Grande (2 por fila)</option></select></label>
        ) : (
          <label className="text-sm"><span className="etiqueta">Tamaño de etiqueta</span><select className="campo w-auto" value={fmt} onChange={e => setFmt(e.target.value)}>{FORMATOS.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></label>
        )}
        {modo === 'rfid' && <>
          <label className="text-sm"><span className="etiqueta">Resolución</span><select className="campo w-auto" value={dpi} onChange={e => setDpi(Number(e.target.value) as 203 | 300)}><option value={203}>203 dpi (8 puntos/mm)</option><option value={300}>300 dpi (12 puntos/mm)</option></select></label>
          {!esPos && <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="accent-[#F9B234]" checked={rfid} onChange={e => setRfid(e.target.checked)} />Grabar el chip RFID</label>}
        </>}
        <div className="ml-auto flex flex-wrap gap-2">
          {modo !== 'rfid' && <button className="btn-primario" onClick={() => window.print()}><Printer size={16} />Imprimir</button>}
          {modo === 'rfid' && <>
            <button className="btn-sec" onClick={() => descargarTexto(`etiquetas-${new Date().toISOString().slice(0, 10)}.zpl`, zpl)}><Download size={16} />Descargar .zpl</button>
            <button className="btn-primario" disabled={enviando} onClick={enviar}><Send size={16} />{enviando ? 'Enviando…' : 'Enviar a la impresora'}</button>
          </>}
        </div>
        {modo === 'termica' && <p className="flex w-full items-start gap-1.5 text-xs text-stone-500"><Info size={13} className="mt-0.5 shrink-0" />En la ventana de impresión elige tu impresora de tickets, tamaño de papel {formato.nombre}, márgenes “Ninguno” y escala 100%. Sale una etiqueta por cada activo.</p>}
        {modo === 'rfid' && <p className="flex w-full items-start gap-1.5 text-xs text-stone-500"><Info size={13} className="mt-0.5 shrink-0" />“Enviar a la impresora” usa Zebra Browser Print (gratis, se instala una vez en la PC de la impresora). Si tu impresora es de otra marca, descarga el .zpl y mándalo con su utilidad en modo de emulación ZPL. {rfid && !esPos && 'Cada etiqueta graba en el chip el EPC del activo; los lectores RFID lo reconocen en escaneo e inventario.'}</p>}
        {msg && <div className="w-full"><Aviso tipo={msg.ok ? 'ok' : 'error'}>{msg.t}</Aviso></div>}
      </div>

      {modo === 'hoja' && (
        <div className={`papel grid ${g.grid} gap-2 rounded-xl bg-white p-2 print:p-0`}>
          {items.map(a => (
            <div key={a.id} className={`flex items-center gap-2 rounded border border-stone-300 ${g.caja} break-inside-avoid`}>
              <QRCodeSVG value={a.url} size={g.qr} level="M" marginSize={0} className="shrink-0" />
              <div className={`min-w-0 leading-tight ${g.txt}`}>
                <div className="mb-1 flex items-center gap-1"><MonogramaFirme className="h-[1.3em] w-auto shrink-0 text-black" /><span className="truncate text-stone-500">{a.empresa}</span></div>
                <p className="font-mono text-[1.25em] font-bold">{a.codigo}</p>
                <p className="line-clamp-2">{a.linea1}</p>
                {a.linea2 && <p className="truncate text-stone-500">{a.linea2}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modo === 'termica' && (
        <div id="etq-termicas" className="papel flex flex-wrap gap-3 rounded-xl bg-white p-3">
          {items.map(a => (
            <div key={a.id} className="etq-term flex items-center overflow-hidden rounded border border-stone-300 bg-white text-black" style={{ width: `${formato.anchoMm}mm`, height: `${formato.altoMm}mm`, padding: '1.5mm', gap: '2mm' }}>
              <QRCodeSVG value={a.url} level="M" marginSize={0} style={{ width: `${qrMm}mm`, height: `${qrMm}mm`, flexShrink: 0 }} />
              <div className="min-w-0 leading-tight" style={{ fontSize: `${Math.max(2.2, formato.altoMm * 0.1)}mm` }}>
                <p className="font-mono font-bold" style={{ fontSize: '1.3em' }}>{a.codigo}</p>
                <p className="line-clamp-2">{a.linea1}</p>
                {a.linea2 && <p className="truncate">{a.linea2}</p>}
                <p className="truncate" style={{ fontSize: '0.85em' }}>{a.empresa}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modo === 'rfid' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="tarjeta min-w-0 p-4">
            <h2 className="mb-3 text-sm font-semibold">{esPos ? 'Etiquetas' : 'Lo que se graba en cada chip'}</h2>
            <ul className="max-h-[480px] space-y-1 overflow-y-auto text-sm">
              {items.map(a => <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-stone-50"><span className="w-28 shrink-0 font-mono text-xs text-marca">{a.codigo}</span><span className="min-w-0 flex-1 truncate">{a.linea1}</span>{!esPos && rfid && <span className="hidden font-mono text-[11px] text-stone-500 sm:inline">{a.epc}</span>}</li>)}
            </ul>
          </section>
          <section className="tarjeta min-w-0 p-4">
            <h2 className="mb-3 text-sm font-semibold">ZPL generado</h2>
            <pre className="max-h-[480px] overflow-auto rounded-lg bg-stone-50 p-3 font-mono text-[11px] leading-snug text-stone-600">{zpl.split('^XZ')[0] + '^XZ'}{items.length > 1 ? `\n… y ${items.length - 1} etiqueta(s) más` : ''}</pre>
          </section>
        </div>
      )}
    </div>
  )
}
