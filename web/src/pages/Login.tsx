import { useMemo, useState } from 'react'
import { Eye, EyeOff, Lock, User, Sparkles, ArrowRight } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { Aviso } from '../components/ui'
import { LogoFirme } from '../components/Logo'
import LogoEmpresa from '../components/LogoEmpresa'

type Modo = 'entrar' | 'registro' | 'recuperar'

/** Las 7 empresas del grupo, las mismas de los formularios (Mesa de Ayuda, Requisiciones, Compras…). */
const EMPRESAS = [
  { nombre: 'Grupo Firme de México', nombre_corto: 'GFM', logo_path: 'app:firme-mexico', logo_oscuro: 'app:firme-mexico' },
  { nombre: 'Control de Ingeniería y Servicios Añadidos', nombre_corto: 'CISA', logo_path: 'app:cisa', logo_oscuro: 'app:cisa' },
  { nombre: 'Construcciones y Terracerías Vanguardia', nombre_corto: 'CTV', logo_path: 'app:vanguardia', logo_oscuro: 'app:vanguardia' },
  { nombre: 'Comercializadora Mupo', nombre_corto: 'MUPO', logo_path: 'app:mupo', logo_oscuro: 'app:mupo' },
  { nombre: 'Inmobiliaria Atardecer de La Paz', nombre_corto: 'Atardecer', logo_path: 'app:atardecer', logo_oscuro: 'app:atardecer' },
  { nombre: 'Proyectos y Desarrollos Punta Cortez', nombre_corto: 'Punta Cortez', logo_path: 'app:punta-cortez', logo_oscuro: 'app:punta-cortez' },
  { nombre: 'Santa Cruz Fid', nombre_corto: 'SCF', logo_path: 'app:santacruz', logo_oscuro: 'app:santacruz' },
]

/** Acepta el usuario (ej. OSCAR COTA) o el correo; el usuario se traduce a su correo para Supabase. */
async function correoDe(usuario: string) {
  const u = usuario.trim()
  if (u.includes('@')) return u
  const { data, error } = await supabase.rpc('correo_de_usuario', { p_usuario: u })
  if (error || !data) throw new Error('Usuario o contraseña incorrectos.')
  return data as string
}

/** Fondo: red de nodos (topología de red), tenue y sin animación; deja libre el centro donde va el acceso. */
function FondoRed() {
  const { nodos, lineas } = useMemo(() => {
    let s = 20261118
    const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
    const nodos: { x: number; y: number; r: number; hub: boolean }[] = []
    while (nodos.length < 70) {
      const x = rnd() * 1600, y = rnd() * 900
      if (Math.abs(x - 800) < 300 && Math.abs(y - 430) < 330) continue   // zona del formulario
      nodos.push({ x, y, r: 1.2 + rnd() * 1.6, hub: rnd() < 0.12 })
    }
    const lineas: [number, number, number, number][] = []
    nodos.forEach((a, i) => {
      nodos.map((b, j) => ({ j, d: Math.hypot(a.x - b.x, a.y - b.y) })).filter(o => o.j > i && o.d < 190).sort((x, y) => x.d - y.d).slice(0, 3)
        .forEach(o => lineas.push([a.x, a.y, nodos[o.j].x, nodos[o.j].y]))
    })
    return { nodos, lineas }
  }, [])
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="fondo-luz" cx="50%" cy="45%" r="60%"><stop offset="0" stopColor="#F9B234" stopOpacity=".06" /><stop offset="1" stopColor="#F9B234" stopOpacity="0" /></radialGradient>
        <radialGradient id="fondo-mascara" cx="50%" cy="48%" r="62%"><stop offset=".25" stopColor="#000" /><stop offset="1" stopColor="#fff" /></radialGradient>
        <mask id="fondo-m"><rect width="1600" height="900" fill="url(#fondo-mascara)" /></mask>
      </defs>
      <rect width="1600" height="900" fill="url(#fondo-luz)" />
      <g mask="url(#fondo-m)">
        {lineas.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8A8F98" strokeOpacity=".22" strokeWidth="1" />)}
        {nodos.map((n, i) => n.hub
          ? <g key={i}><circle cx={n.x} cy={n.y} r={7} fill="none" stroke="#F9B234" strokeOpacity=".35" /><circle cx={n.x} cy={n.y} r={2.4} fill="#F9B234" fillOpacity=".7" /></g>
          : <circle key={i} cx={n.x} cy={n.y} r={n.r} fill="#A8ADB5" fillOpacity=".45" />)}
      </g>
    </svg>
  )
}

export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [usuario, setUsuario] = useState('')
  const [pass, setPass] = useState('')
  const [nombre, setNombre] = useState('')
  const [msg, setMsg] = useState<{ t: 'error' | 'ok'; m: string } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [ver, setVer] = useState(false)
  const demo = (window as unknown as { __DEMO_CRED?: { email: string; password: string } }).__DEMO_CRED

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true); setMsg(null)
    try {
      if (modo === 'entrar') {
        const email = await correoDe(usuario)
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw new Error(/invalid/i.test(error.message) ? 'Usuario o contraseña incorrectos.' : mensajeError(error))
      } else if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({
          email: usuario.trim(), password: pass,
          options: { data: { nombre }, emailRedirectTo: window.location.origin + window.location.pathname },
        })
        if (error) throw error
        setMsg({ t: 'ok', m: data.session ? 'Cuenta creada.' : 'Te enviamos un correo para confirmar tu cuenta. Después un administrador debe activarla.' })
      } else {
        const email = await correoDe(usuario)
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '#/cambiar-contrasena' })
        if (error) throw error
        setMsg({ t: 'ok', m: 'Si el usuario existe, le llegará a su correo un enlace para cambiar la contraseña.' })
      }
    } catch (err) {
      setMsg({ t: 'error', m: mensajeError(err) })
    } finally { setCargando(false) }
  }

  const cambiar = (m: Modo) => { setModo(m); setMsg(null) }

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-[#0B0C0F]">
      <FondoRed />
      <main className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 text-center">
            <LogoFirme className="mx-auto h-11 w-auto text-[#fff]" />
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[.22em] text-stone-500">Control de activos</p>
          </div>

          <form onSubmit={enviar} className="rounded-2xl border border-stone-200 bg-[#111317] p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-lg font-semibold">{modo === 'entrar' ? 'Iniciar sesión' : modo === 'registro' ? 'Solicitar acceso' : 'Recuperar contraseña'}</h1>
              <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />en línea</span>
            </div>

            {demo && modo === 'entrar' && (
              <div className="mb-4 rounded-lg border border-stone-200 p-3 text-xs">
                <p className="mb-1 flex items-center gap-1.5 font-medium text-marca"><Sparkles size={13} />Acceso de prueba</p>
                <p className="text-stone-500">Usuario <span className="font-mono text-tinta">{demo.email}</span> · Contraseña <span className="font-mono text-tinta">{demo.password}</span></p>
                <button type="button" className="mt-1.5 text-marca hover:underline" onClick={() => { setUsuario(demo.email); setPass(demo.password) }}>Llenar por mí</button>
              </div>
            )}

            <div className="space-y-4">
              {modo === 'registro' && (
                <label className="block"><span className="etiqueta">Nombre completo</span>
                  <input className="campo" required value={nombre} onChange={e => setNombre(e.target.value)} /></label>
              )}
              <label className="block"><span className="etiqueta">{modo === 'registro' ? 'Correo' : 'Usuario'}</span>
                <span className="relative block"><User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="campo pl-9" required autoComplete="username" autoCapitalize="characters" spellCheck={false}
                    type={modo === 'registro' ? 'email' : 'text'} placeholder={modo === 'registro' ? 'nombre@empresa.mx' : 'Usuario o correo'}
                    value={usuario} onChange={e => setUsuario(e.target.value)} /></span></label>
              {modo !== 'recuperar' && (
                <label className="block"><span className="etiqueta">Contraseña</span>
                  <span className="relative block"><Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                    <input className="campo px-9" type={ver ? 'text' : 'password'} required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                      value={pass} onChange={e => setPass(e.target.value)} />
                    <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-stone-400 hover:text-tinta">{ver ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </span></label>
              )}
              {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
              <button className="btn-primario w-full justify-center py-2.5 !shadow-none" disabled={cargando}>
                {cargando ? 'Un momento…' : modo === 'entrar' ? <>Entrar<ArrowRight size={16} /></> : modo === 'registro' ? 'Enviar solicitud' : 'Enviar enlace'}
              </button>
            </div>

            <div className="mt-5 flex justify-between border-t border-stone-200 pt-4 text-xs text-stone-500">
              {modo === 'entrar'
                ? <><button type="button" className="hover:text-tinta" onClick={() => cambiar('recuperar')}>Olvidé mi contraseña</button>
                    <button type="button" className="hover:text-tinta" onClick={() => cambiar('registro')}>Solicitar acceso</button></>
                : <button type="button" className="hover:text-tinta" onClick={() => cambiar('entrar')}>← Volver a iniciar sesión</button>}
            </div>
          </form>
        </div>
      </main>

      <footer className="relative border-t border-stone-200 bg-[#0B0C0F]/80 px-4 py-6 backdrop-blur">
        <ul className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-8 gap-y-4 opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0">
          {EMPRESAS.map(e => (
            <li key={e.nombre} title={e.nombre} className="flex h-9 w-28 items-center justify-center">
              <LogoEmpresa empresa={e} alto={30} ancho={112} />
            </li>
          ))}
        </ul>
        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[.2em] text-stone-500">Departamento de TICS · Grupo Empresarial Firme</p>
      </footer>
    </div>
  )
}
