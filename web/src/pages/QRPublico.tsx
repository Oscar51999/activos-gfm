import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LogIn, Siren, ClipboardCheck, ChevronLeft } from 'lucide-react'
import { supabase, ESTATUS, type Estatus } from '../lib/supabase'
import { Cargando, Aviso } from '../components/ui'
import { LogoFirme } from '../components/Logo'
import FotoActivo from '../components/FotoActivo'
import ReportarFalla from '../components/ReportarFalla'
import ChecklistDiario from '../components/Checklist'
import type { TipoEquipo } from '../lib/mantenimiento'
import { registrarEscaneo } from '../lib/escaneo'
import { PieLegal } from './Legal'

type Info = { codigo: string; descripcion: string; marca: string | null; modelo: string | null; categoria: string; serie: string | null; numero_economico: string | null
  empresa: string; ubicacion: string | null; estatus: Estatus; foto: string | null }

function Dato({ k, v }: { k: string; v: string | null | undefined }) {
  return <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wider text-stone-500">{k}</dt><dd className="mt-0.5 break-words text-sm font-medium">{v || '—'}</dd></div>
}

/** Lo que ve quien escanea la etiqueta QR o el sticker NFC sin haber iniciado sesión: primero la información del equipo y luego, si quiere, reportar una falla. */
export default function QRPublico({ onEntrar }: { onEntrar: () => void }) {
  const { qr } = useParams()
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [tipo, setTipo] = useState<TipoEquipo>('otro')
  const [modo, setModo] = useState<'info' | 'checklist' | 'reporte'>('info')
  const form = useRef<HTMLDivElement>(null)
  useEffect(() => {
    supabase.rpc('ficha_qr', { p_qr: qr }).then(async ({ data, error }) => {
      if (!error) { setInfo(((data as Info[]) ?? [])[0] ?? null); return }
      // por si la función nueva todavía no existe en la base: datos mínimos
      const r = await supabase.rpc('activo_por_qr', { p_qr: qr })
      const x = ((r.data as Partial<Info>[]) ?? [])[0]
      setInfo(x ? { categoria: '', serie: null, numero_economico: null, ubicacion: null, estatus: 'disponible', ...x } as Info : null)
    })
    if (qr) registrarEscaneo({ qr, origen: 'etiqueta' })
    supabase.rpc('tipo_equipo_por_qr', { p_qr: qr }).then(({ data }) => setTipo((data as TipoEquipo | null) ?? 'otro'))
  }, [qr])
  useEffect(() => { if (modo !== 'info') setTimeout(() => form.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60) }, [modo])

  const nombre = info ? [info.marca, info.modelo].filter(Boolean).join(' ') || info.descripcion : ''
  return (
    <div className="min-h-full px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <LogoFirme className="h-8 w-auto text-tinta" />
          <button onClick={onEntrar} className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-marca"><LogIn size={15} />Soy del equipo</button>
        </div>
        {info === undefined ? <Cargando /> : info === null ? <Aviso>Esta etiqueta no está registrada o el activo ya fue dado de baja.</Aviso> : (
          <div className="space-y-4 animate-entrar">
            <article className="tarjeta overflow-hidden">
              <FotoActivo fotoModelo={info.foto} categoria={info.categoria} className="aspect-[16/9] w-full" icono={44} />
              <div className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-xs text-marca">{info.codigo}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${ESTATUS[info.estatus]?.clase ?? ''}`}>{ESTATUS[info.estatus]?.texto ?? info.estatus}</span>
                </div>
                <h1 className="mt-1 text-xl font-semibold leading-tight">{nombre}</h1>
                {nombre !== info.descripcion && <p className="text-sm text-stone-500">{info.descripcion}</p>}
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-stone-200 pt-4">
                  <Dato k="Categoría" v={info.categoria} />
                  <Dato k="Empresa" v={info.empresa} />
                  <Dato k="No. de serie" v={info.serie} />
                  <Dato k="No. económico" v={info.numero_economico} />
                  <div className="col-span-2"><Dato k="Ubicación" v={info.ubicacion} /></div>
                </dl>
              </div>
            </article>

            {modo === 'info' ? (
              <div className="grid gap-2">
                <button className="btn-primario w-full justify-center !py-3 text-base" onClick={() => setModo('reporte')}><Siren size={18} />Reportar una falla o daño</button>
                {tipo !== 'otro' && <button className="btn-sec w-full justify-center !py-3" onClick={() => setModo('checklist')}><ClipboardCheck size={18} />Checklist antes de arrancar</button>}
                <button className="btn-sec w-full justify-center !py-3" onClick={onEntrar}><LogIn size={18} />Ver ficha completa (iniciar sesión)</button>
                <p className="px-2 text-center text-[11px] text-stone-500">¿Eres del equipo? Inicia sesión una vez en este navegador y la próxima vez que escanees verás la ficha completa: responsable, asignar, traspasar y dar de baja.</p>
              </div>
            ) : (
              <div ref={form} className="tarjeta scroll-mt-4 p-5">
                <button className="mb-3 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-tinta" onClick={() => setModo('info')}><ChevronLeft size={15} />Volver a la información</button>
                {modo === 'checklist' ? <>
                  <h2 className="mb-1 text-xl font-semibold">Checklist antes de arrancar</h2>
                  <p className="mb-5 text-sm text-stone-500">Revisa cada punto. Si algo falla, se avisa a mantenimiento en automático.</p>
                  <ChecklistDiario qr={qr!} tipo={tipo} />
                </> : <>
                  <h2 className="mb-1 text-xl font-semibold">Reportar un problema</h2>
                  <p className="mb-5 text-sm text-stone-500">¿Este equipo falla, está dañado o no aparece? Avísale a almacén en un minuto.</p>
                  <ReportarFalla qr={qr!} anonimo />
                </>}
              </div>
            )}
            <p className="text-center text-[11px] text-stone-400">Grupo Empresarial Firme · Control de activos</p>
            <PieLegal />
          </div>
        )}
      </div>
    </div>
  )
}
