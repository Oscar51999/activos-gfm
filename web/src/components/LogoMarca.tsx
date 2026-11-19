import { useState } from 'react'
import {
  Laptop, Monitor, Printer, Tablet, Router, BatteryCharging, Projector, Mouse, Cpu, Radio, Smartphone, Phone, RadioTower, Compass, Crosshair, Satellite, Plane,
  Drill, Hammer, Flame, Wind, Zap, Tractor, Construction, Forklift, Truck, Car, CarFront, Bike, Container, Armchair, Archive, Table2, Droplets, Cog, Waves, Scissors,
  Package, Wrench, Boxes, type LucideIcon,
} from 'lucide-react'

const sinAcentos = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Icono que representa un tipo o subtipo de producto (Laptops, Retroexcavadoras, Pick-up…). */
export function iconoTipo(nombre?: string | null): LucideIcon {
  const n = sinAcentos(nombre ?? '')
  const reglas: [RegExp, LucideIcon][] = [
    [/laptop/, Laptop], [/escritorio|cpu|desktop/, Cpu], [/monitor|pantalla/, Monitor], [/impresora|multifuncional/, Printer], [/tablet/, Tablet], [/red|router|switch/, Router],
    [/no-?break|energia/, BatteryCharging], [/proyector/, Projector], [/accesorio/, Mouse], [/computo/, Laptop],
    [/radio/, Radio], [/celular/, Smartphone], [/telefono/, Phone], [/antena|repetidor/, RadioTower], [/comunicacion/, Radio],
    [/estacion|topograf/, Compass], [/nivel/, Crosshair], [/gps|gnss/, Satellite], [/dron/, Plane],
    [/electrica/, Drill], [/manual/, Hammer], [/soldadora/, Flame], [/compresor/, Wind], [/generador/, Zap], [/herramienta/, Wrench],
    [/retro|excavadora|cargador/, Tractor], [/motoconformadora|compactador|maquinaria/, Construction], [/grua|montacargas/, Forklift],
    [/pick|camion/, Truck], [/sedan/, Car], [/suv/, CarFront], [/moto/, Bike], [/remolque/, Container], [/vehiculo/, Car],
    [/silla/, Armchair], [/archivero|librero/, Archive], [/escritorio|mesa|mobiliario/, Table2],
    [/bomba/, Droplets], [/revolvedora/, Cog], [/vibrador/, Waves], [/cortadora/, Scissors], [/menor/, Package], [/todas|todo/, Boxes],
  ]
  return reglas.find(([re]) => re.test(n))?.[1] ?? Package
}

/** Color de fondo por tipo, para que cada tarjeta se distinga. */
export function colorTipo(nombre?: string | null): string {
  const n = sinAcentos(nombre ?? '')
  if (/computo|laptop|monitor|impresora|tablet|red|proyector|accesorio|break/.test(n)) return '#4F7BC8'
  if (/comunicacion|radio|celular|telefono|antena/.test(n)) return '#1FB5B8'
  if (/topograf|estacion|nivel|gps|dron/.test(n)) return '#8B6FD6'
  if (/vehiculo|pick|sedan|suv|camion|moto|remolque/.test(n)) return '#3DAE7A'
  if (/maquinaria|retro|excavadora|motoconf|compact|cargador|grua/.test(n)) return '#E2A64B'
  if (/herramienta|soldadora|compresor|generador/.test(n)) return '#D9674E'
  if (/mobiliario|silla|escritorio|archivero|mesa/.test(n)) return '#A38A6B'
  return '#8A97A8'
}

// Nombre de la marca → identificador de Simple Icons (logos de marcas libres)
const ALIAS: Record<string, string> = { 'hewlett packard': 'hp', 'hp inc': 'hp', cat: 'caterpillar', 'black & decker': 'blackanddecker', 'john deere': 'johndeere', 'new holland': 'newholland', 'tp-link': 'tplink', 'mercedes benz': 'mercedes', 'mercedes-benz': 'mercedes' }
const slug = (n: string) => { const s = sinAcentos(n).trim(); return ALIAS[s] ?? s.replace(/&/g, 'and').replace(/[^a-z0-9]/g, '') }

/** Logo de una marca: el que subieron; si no, el de Simple Icons; si no, el favicon de su sitio; si no, iniciales. */
export default function LogoMarca({ marca, tam = 48, className = '' }: { marca: { nombre: string; logo?: string | null; sitio?: string | null }; tam?: number; className?: string }) {
  const fuentes = [marca.logo, `https://cdn.simpleicons.org/${slug(marca.nombre)}`, marca.sitio ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(marca.sitio)}&sz=128` : null].filter(Boolean) as string[]
  const [i, setI] = useState(0)
  const ini = marca.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl bg-[#fff] ring-1 ring-black/5 ${className}`} style={{ width: tam, height: tam }}>
      {i < fuentes.length
        ? <img src={fuentes[i]} alt={marca.nombre} loading="lazy" onError={() => setI(x => x + 1)} className="object-contain" style={{ width: tam * .62, height: tam * .62 }} />
        : <span className="font-display font-bold text-[#1C1F24]" style={{ fontSize: tam * .34 }}>{ini}</span>}
    </span>
  )
}
