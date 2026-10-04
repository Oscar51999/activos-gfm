import { CalendarClock, Infinity as Siempre } from 'lucide-react'

const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
export const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export function diasPara(fecha: string) { const [y, m, d] = fecha.slice(0, 10).split('-').map(Number); return Math.round((new Date(y, m - 1, d).getTime() - hoy().getTime()) / 864e5) }
export const fechaCorta = (f: string) => { const [y, m, d] = f.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }

/** Texto y color de la cuenta regresiva de un préstamo. */
export function estadoPrestamo(fecha: string) {
  const n = diasPara(fecha)
  if (n < 0) return { texto: `Vencido hace ${-n} día${n === -1 ? '' : 's'}`, clase: 'bg-red-50 text-red-700 ring-red-200', n }
  if (n === 0) return { texto: 'Regresa hoy', clase: 'bg-amber-50 text-amber-800 ring-amber-200', n }
  if (n <= 3) return { texto: `Regresa en ${n} día${n === 1 ? '' : 's'}`, clase: 'bg-amber-50 text-amber-800 ring-amber-200', n }
  return { texto: `Regresa el ${fechaCorta(fecha)}`, clase: 'bg-sky-50 text-sky-700 ring-sky-200', n }
}
export function PrestamoBadge({ fecha }: { fecha: string }) {
  const e = estadoPrestamo(fecha)
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${e.clase}`}><CalendarClock size={11} />{e.texto}</span>
}

/** Elegir si el resguardo es indefinido o un préstamo con fecha de regreso. */
export function SelectorPrestamo({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const mas = (d: number) => { const x = hoy(); x.setDate(x.getDate() + d); return isoDia(x) }
  const opciones: [string, string][] = [['Hoy', mas(0)], ['3 días', mas(3)], ['1 semana', mas(7)], ['2 semanas', mas(14)], ['1 mes', mas(30)]]
  return (
    <div>
      <span className="etiqueta">¿Hasta cuándo?</span>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onCambio('')} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${!valor ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600 hover:border-marca/50'}`}>
          <Siempre size={13} />Indefinido
        </button>
        {opciones.map(([t, f]) => (
          <button key={t} type="button" onClick={() => onCambio(f)} className={`rounded-lg border px-3 py-1.5 text-xs transition ${valor === f ? 'border-marca bg-marca/10 text-marca' : 'border-stone-300 text-stone-600 hover:border-marca/50'}`}>{t}</button>
        ))}
        <input type="date" min={mas(0)} value={valor} onChange={e => onCambio(e.target.value)} className="campo !w-auto !py-1.5 text-xs" aria-label="Fecha de regreso" />
      </div>
      {valor && <p className="mt-2 text-xs text-stone-500">Préstamo: debe regresar el <b className="text-tinta">{fechaCorta(valor)}</b>. Si no regresa, aparece como vencido en el tablero.</p>}
    </div>
  )
}
