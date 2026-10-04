import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Cargando, Aviso } from '../components/ui'
import { LogoFirme } from '../components/Logo'
import FotoActivo from '../components/FotoActivo'
import ReportarFalla from '../components/ReportarFalla'
import ChecklistDiario from '../components/Checklist'
import type { TipoEquipo } from '../lib/mantenimiento'

type Info = { codigo: string; descripcion: string; marca: string | null; modelo: string | null; empresa: string; foto: string | null }

/** Lo que ve quien escanea una etiqueta sin haber iniciado sesión: qué es y cómo reportar un problema. */
export default function QRPublico({ onEntrar }: { onEntrar: () => void }) {
  const { qr } = useParams()
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [tipo, setTipo] = useState<TipoEquipo>('otro')
  const [modo, setModo] = useState<'checklist' | 'reporte'>('reporte')
  useEffect(() => {
    supabase.rpc('activo_por_qr', { p_qr: qr }).then(({ data }) => setInfo(((data as Info[]) ?? [])[0] ?? null))
    supabase.rpc('tipo_equipo_por_qr', { p_qr: qr }).then(({ data }) => { const t = (data as TipoEquipo | null) ?? 'otro'; setTipo(t); if (t !== 'otro') setModo('checklist') })
  }, [qr])

  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <LogoFirme className="h-8 w-auto text-[#fff]" />
          <button onClick={onEntrar} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-marca"><LogIn size={15} />Soy del equipo</button>
        </div>
        {info === undefined ? <Cargando /> : info === null ? <Aviso>Esta etiqueta no está registrada o el activo ya fue dado de baja.</Aviso> : (
          <div className="space-y-4 animate-entrar">
            <div className="tarjeta flex items-center gap-4 overflow-hidden p-3">
              <FotoActivo fotoModelo={info.foto} className="h-20 w-24 shrink-0 rounded-xl" icono={26} />
              <div className="min-w-0">
                <p className="font-mono text-xs text-marca">{info.codigo}</p>
                <p className="truncate text-lg font-semibold">{[info.marca, info.modelo].filter(Boolean).join(' ') || info.descripcion}</p>
                <p className="truncate text-xs text-stone-500">{info.descripcion} · {info.empresa}</p>
              </div>
            </div>
            {tipo !== 'otro' && (
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-stone-200 bg-stone-50 p-1">
                {([['checklist', 'Checklist diario'], ['reporte', 'Reportar problema']] as const).map(([k, t]) => (
                  <button key={k} onClick={() => setModo(k)} className={`rounded-xl px-3 py-2 text-sm font-medium transition ${modo === k ? 'bg-marca text-[#120D04]' : 'text-stone-500'}`}>{t}</button>
                ))}
              </div>
            )}
            {modo === 'checklist' && tipo !== 'otro' ? (
              <div className="tarjeta p-5">
                <h1 className="mb-1 text-xl font-semibold">Checklist antes de arrancar</h1>
                <p className="mb-5 text-sm text-stone-500">Revisa cada punto. Si algo falla, se avisa a mantenimiento en automático.</p>
                <ChecklistDiario qr={qr!} tipo={tipo} />
              </div>
            ) : (
              <div className="tarjeta p-5">
                <h1 className="mb-1 text-xl font-semibold">Reportar un problema</h1>
                <p className="mb-5 text-sm text-stone-500">¿Este equipo falla, está dañado o no aparece? Avísale a almacén en un minuto.</p>
                <ReportarFalla qr={qr!} anonimo />
              </div>
            )}
            <p className="text-center text-[11px] text-stone-400">Grupo Empresarial Firme · Control de activos</p>
          </div>
        )}
      </div>
    </div>
  )
}
