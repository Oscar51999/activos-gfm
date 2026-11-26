import { useMemo } from 'react'

type P = { lat: number; lng: number }
const W = 640, H = 400

const mundo = (p: P, z: number) => {
  const n = 256 * 2 ** z, r = (p.lat * Math.PI) / 180
  return { x: ((p.lng + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}

/** Dibuja el recorrido de un viaje sobre el mapa de OpenStreetMap (sin librerías). */
export default function RutaMapa({ puntos }: { puntos: P[] }) {
  const m = useMemo(() => {
    if (!puntos.length) return null
    let z = 17
    for (; z > 3; z--) {
      const w = puntos.map(p => mundo(p, z))
      const xs = w.map(q => q.x), ys = w.map(q => q.y)
      if (Math.max(...xs) - Math.min(...xs) <= W - 80 && Math.max(...ys) - Math.min(...ys) <= H - 80) break
    }
    const w = puntos.map(p => mundo(p, z))
    const xs = w.map(q => q.x), ys = w.map(q => q.y)
    const ox = (Math.max(...xs) + Math.min(...xs)) / 2 - W / 2, oy = (Math.max(...ys) + Math.min(...ys)) / 2 - H / 2
    const tiles: { x: number; y: number; url: string }[] = []
    const n = 2 ** z
    for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++)
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++)
        if (ty >= 0 && ty < n) tiles.push({ x: tx * 256 - ox, y: ty * 256 - oy, url: `https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png` })
    return { tiles, linea: w.map(q => `${(q.x - ox).toFixed(1)},${(q.y - oy).toFixed(1)}`).join(' '), a: { x: w[0].x - ox, y: w[0].y - oy }, b: { x: w[w.length - 1].x - ox, y: w[w.length - 1].y - oy } }
  }, [puntos])
  if (!m) return <div className="grid aspect-[16/10] place-items-center rounded-xl bg-stone-100 text-sm text-stone-500">Sin puntos GPS en este viaje.</div>
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full bg-stone-200" role="img" aria-label="Recorrido del viaje">
        {m.tiles.map(t => <image key={t.url + t.x} href={t.url} x={t.x} y={t.y} width={256} height={256} />)}
        <polyline points={m.linea} fill="none" stroke="#fff" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
        <polyline points={m.linea} fill="none" stroke="#E2A64B" strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={m.a.x} cy={m.a.y} r={8} fill="#10b981" stroke="#fff" strokeWidth={3} />
        <circle cx={m.b.x} cy={m.b.y} r={8} fill="#ef4444" stroke="#fff" strokeWidth={3} />
      </svg>
      <p className="bg-stone-50 px-3 py-1 text-right text-[10px] text-stone-400">Mapa © colaboradores de OpenStreetMap</p>
    </div>
  )
}
