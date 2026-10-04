import { useState } from 'react'
import { urlLogo, iniciales, type EmpresaLogo, type Variante } from '../lib/logos'
import { LogoFirme } from './Logo'

/**
 * Logo de empresa con tamaño óptico parejo: un logo horizontal y uno cuadrado ocupan
 * la misma "área visual", para que todas las tarjetas se vean iguales.
 */
export default function LogoEmpresa({ empresa, alto = 48, ancho = 220, variante = 'oscuro', className = '' }: {
  empresa: EmpresaLogo; alto?: number; ancho?: number; variante?: Variante; className?: string
}) {
  const url = urlLogo(empresa, variante)
  const [ratio, setRatio] = useState<number | null>(null)

  if (url === 'svg:grupo-firme') {
    const h = Math.min(alto * 0.78, ancho / 3.34)
    return (
      <span className={`inline-flex items-center justify-center ${className}`} style={{ height: alto * 1.25, width: '100%', maxWidth: ancho }}>
        <span style={{ height: h, width: h * 3.34 }} className="block"><LogoFirme className={`h-full w-full ${variante === 'oscuro' ? 'text-[#fff]' : 'text-black'}`} title={empresa.nombre} /></span>
      </span>
    )
  }

  if (!url) {
    const color = empresa.color || '#F9B234'
    return (
      <span className={`inline-flex items-center justify-center gap-3 ${className}`} style={{ height: alto }}>
        <span className="grid place-items-center rounded-xl font-display font-bold text-[#120D04]"
          style={{ height: alto * 0.8, width: alto * 0.8, background: `linear-gradient(135deg, ${color}, ${color}aa)`, fontSize: alto * 0.3, boxShadow: `0 0 24px -6px ${color}` }}>
          {iniciales(empresa.nombre_corto || empresa.nombre)}
        </span>
        <span className={`max-w-[10rem] text-left text-sm font-semibold leading-tight ${variante === 'oscuro' ? '' : 'text-black'}`}>{empresa.nombre_corto || empresa.nombre}</span>
      </span>
    )
  }

  // área objetivo = la de un logo 2:1 a la altura indicada
  const r = ratio ?? 2
  let h = alto * Math.sqrt(2 / r)
  h = Math.min(h, alto * 1.25)
  let w = h * r
  if (w > ancho) { w = ancho; h = w / r }
  return (
    <span className={`inline-flex items-center justify-center ${className}`} style={{ height: alto * 1.25, width: '100%', maxWidth: ancho }}>
      <img src={url} alt={empresa.nombre} draggable={false} onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
        style={{ height: h, width: ratio ? w : 'auto', opacity: ratio ? 1 : 0, transition: 'opacity .3s' }} className="object-contain" />
    </span>
  )
}
