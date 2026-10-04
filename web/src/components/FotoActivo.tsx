import { useEffect, useState } from 'react'
import { Truck, Laptop, Wrench, Package, Compass, Zap, Tractor, Smartphone, type LucideIcon } from 'lucide-react'
import { urlFirmada } from '../lib/fotos'

/** Icono por categoría cuando no hay foto. */
export function iconoCategoria(cat?: string | null): LucideIcon {
  const c = (cat ?? '').toLowerCase()
  if (c.includes('vehíc') || c.includes('vehic') || c.includes('camion')) return Truck
  if (c.includes('maquinaria')) return Tractor
  if (c.includes('cómputo') || c.includes('computo') || c.includes('laptop')) return Laptop
  if (c.includes('herramienta')) return Wrench
  if (c.includes('topograf')) return Compass
  if (c.includes('eléctr') || c.includes('generador') || c.includes('menor')) return Zap
  if (c.includes('telef') || c.includes('celular')) return Smartphone
  return Package
}

/** Foto de la unidad; si no tiene, la foto de referencia del producto; si tampoco, un icono. */
export default function FotoActivo({ foto, fotoModelo, categoria, className = '', icono = 28 }: {
  foto?: string | null; fotoModelo?: string | null; categoria?: string | null; className?: string; icono?: number
}) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let vivo = true
    const ref = foto || fotoModelo
    if (!ref) { setUrl(''); return }
    urlFirmada(ref).then(u => { if (vivo) setUrl(u) })
    return () => { vivo = false }
  }, [foto, fotoModelo])
  const I = iconoCategoria(categoria)
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-stone-100 to-transparent ${className}`}>
      {url
        ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        : <div className="grid h-full w-full place-items-center text-stone-400"><I size={icono} strokeWidth={1.4} /></div>}
    </div>
  )
}
