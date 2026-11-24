import { useEffect, useState } from 'react'
import { Radar, MapPin, ExternalLink, AlertTriangle, Nfc, ScanLine, QrCode } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mosaico, linkMapa } from '../lib/escaneo'

type E = { id: string; created_at: string; quien: string; origen: string; latitud: number | null; longitud: number | null; precision_m: number | null; distancia_km: number | null; lejos: boolean }
const ORIGEN: Record<string, { t: string; i: typeof Nfc }> = { etiqueta: { t: 'Etiqueta (QR o NFC)', i: QrCode }, lector: { t: 'Lector', i: ScanLine }, nfc_celular: { t: 'NFC con celular', i: Nfc }, camara: { t: 'Cámara', i: QrCode } }
const cuando = (s: string) => new Date(s).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

/** "Visto por última vez": el último escaneo del equipo con su mapa, y los anteriores. */
export default function UltimoEscaneo({ activoId }: { activoId: string }) {
  const [lista, setLista] = useState<E[] | null>(null)
  useEffect(() => {
    supabase.from('escaneos').select('id,created_at,quien,origen,latitud,longitud,precision_m,distancia_km,lejos').eq('activo_id', activoId).order('created_at', { ascending: false }).limit(8)
      .then(({ data }) => setLista((data as E[]) ?? []))
  }, [activoId])
  if (!lista) return null
  const ult = lista[0], ubicado = lista.find(e => e.latitud != null)
  const m = ubicado ? mosaico(Number(ubicado.latitud), Number(ubicado.longitud)) : null

  return (
    <section className="tarjeta overflow-hidden">
      <div className="flex items-center justify-between gap-2 p-5 pb-3">
        <h2 className="flex items-center gap-2 font-semibold"><Radar size={17} className="text-marca" />Visto por última vez</h2>
        {ult && <span className="text-xs text-stone-500">{lista.length >= 8 ? 'últimos 8 escaneos' : `${lista.length} escaneo(s)`}</span>}
      </div>
      {!ult ? <p className="px-5 pb-5 text-sm text-stone-500">Todavía nadie ha escaneado este equipo. Cada vez que alguien lea su QR o su sticker NFC, aquí quedará cuándo, quién y dónde.</p> : <>
        {m && ubicado && (
          <a href={linkMapa(Number(ubicado.latitud), Number(ubicado.longitud))} target="_blank" rel="noreferrer" className="relative block h-44 overflow-hidden bg-stone-100" title="Abrir en Google Maps">
            <div className="absolute left-1/2 top-1/2" style={{ width: 768, height: 768, transform: `translate(${-256 - m.px}px, ${-256 - m.py}px)` }}>
              {m.tiles.map(t => <img key={t.url} src={t.url} alt="" loading="lazy" className="absolute h-64 w-64 max-w-none" style={{ left: (t.dx + 1) * 256, top: (t.dy + 1) * 256 }} />)}
            </div>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-red-600 drop-shadow"><MapPin size={34} fill="currentColor" stroke="white" strokeWidth={1.5} /></span>
            <span className="absolute bottom-1 right-1 rounded bg-white/80 px-1 text-[9px] text-stone-600">© OpenStreetMap</span>
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-medium text-stone-800 shadow"><ExternalLink size={11} />Ver en Google Maps</span>
          </a>
        )}
        <div className="space-y-2 p-5 pt-3">
          {ubicado?.lejos && <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertTriangle size={14} />Se escaneó a {ubicado.distancia_km} km de su ubicación asignada.</p>}
          {!ubicado && <p className="text-xs text-stone-500">Los escaneos no traen ubicación (el celular no dio permiso o se usó el lector de escritorio).</p>}
          <ul className="divide-y divide-stone-100">
            {lista.map(e => { const O = ORIGEN[e.origen] ?? ORIGEN.etiqueta; return (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <O.i size={15} className="shrink-0 text-stone-400" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{e.quien}</span><span className="block text-xs text-stone-500">{cuando(e.created_at)} · {O.t}</span></span>
                {e.latitud != null ? <a className={`shrink-0 text-xs hover:underline ${e.lejos ? 'text-red-600' : 'text-marca'}`} href={linkMapa(Number(e.latitud), Number(e.longitud))} target="_blank" rel="noreferrer">{e.distancia_km != null ? `${e.distancia_km} km` : 'Mapa'}</a> : <span className="shrink-0 text-xs text-stone-400">sin ubicación</span>}
              </li>
            ) })}
          </ul>
        </div>
      </>}
    </section>
  )
}
