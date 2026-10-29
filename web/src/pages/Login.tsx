import { useState } from 'react'
import { Eye, EyeOff, Mail, Lock, User, Sparkles } from 'lucide-react'
import { supabase, mensajeError } from '../lib/supabase'
import { Aviso } from '../components/ui'
import { LogoFirme } from '../components/Logo'

type Modo = 'entrar' | 'registro' | 'recuperar'

export default function Login() {
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
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
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
      } else if (modo === 'registro') {
        const { data, error } = await supabase.auth.signUp({
          email, password: pass,
          options: { data: { nombre }, emailRedirectTo: window.location.origin + window.location.pathname },
        })
        if (error) throw error
        setMsg({ t: 'ok', m: data.session
          ? 'Cuenta creada.'
          : 'Te enviamos un correo para confirmar tu cuenta. Después un administrador debe activarla.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '#/cambiar-contrasena' })
        if (error) throw error
        setMsg({ t: 'ok', m: 'Si el correo existe, te llegará un enlace para cambiar la contraseña.' })
      }
    } catch (err) {
      setMsg({ t: 'error', m: mensajeError(err) })
    } finally { setCargando(false) }
  }

  return (
    <div className="relative grid min-h-full overflow-hidden lg:grid-cols-[1.15fr_1fr]">
      {/* Piso de rejilla en perspectiva */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] [perspective:600px]">
        <div className="absolute inset-0 origin-bottom [transform:rotateX(62deg)] [background-image:linear-gradient(rgb(249_178_52/.35)_1px,transparent_1px),linear-gradient(90deg,rgb(249_178_52/.35)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_top,black,transparent_85%)]" style={{ animation: 'rejilla 3s linear infinite' }} />
      </div>
      <div aria-hidden className="pointer-events-none absolute -left-40 top-1/4 h-[32rem] w-[32rem] rounded-full bg-marca/20 blur-[120px]" />

      <div className="relative hidden flex-col justify-between p-12 lg:flex">
        <LogoFirme className="h-12 w-auto self-start text-[#fff]" />
        <div className="animate-entrar">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-marca/40 bg-marca/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[.2em] text-marca">
            <span className="h-1.5 w-1.5 rounded-full bg-marca shadow-[0_0_8px_#F9B234]" />Control de activos
          </p>
          <h1 className="text-5xl font-semibold leading-[1.05] xl:text-6xl">Cada activo,<br />con <span className="brillo text-marca">dueño</span> y<br />ubicación.</h1>
          <p className="mt-5 max-w-md text-stone-500">Registro con QR, resguardos con firma, documentos con vigencia y mantenimiento de todo el equipo del grupo.</p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {[['QR', 'en cada equipo'], ['Firma', 'en pantalla'], ['3', 'empresas, un panel']].map(([a, b]) => (
              <div key={a} className="tarjeta px-4 py-3"><p className="cifra text-xl font-semibold text-marca">{a}</p><p className="text-[11px] text-stone-500">{b}</p></div>
            ))}
          </div>
        </div>
        <p className="text-[11px] uppercase tracking-[.2em] text-stone-400">Departamento de TICS · Grupo Empresarial Firme</p>
      </div>

      <div className="relative flex items-center justify-center p-6">
        <form onSubmit={enviar} className="tarjeta w-full max-w-sm animate-entrar space-y-5 p-7 shadow-[0_0_120px_-30px_rgb(249_178_52/.45)] sm:p-8">
          <LogoFirme className="mx-auto mb-2 h-10 w-auto text-[#fff] lg:hidden" />
          <div>
            <h2 className="text-2xl font-semibold">{modo === 'entrar' ? 'Iniciar sesión' : modo === 'registro' ? 'Crear cuenta' : 'Recuperar contraseña'}</h2>
            <p className="mt-1 text-sm text-stone-500">Accede al sistema de control de activos</p>
          </div>
          {demo && modo === 'entrar' && (
            <div className="rounded-xl border border-marca/30 bg-marca/10 p-3 text-xs">
              <p className="mb-1.5 flex items-center gap-1.5 font-medium text-marca"><Sparkles size={13} />Acceso de prueba</p>
              <p className="text-stone-600">Usuario: <span className="font-mono text-tinta">{demo.email}</span></p>
              <p className="text-stone-600">Contraseña: <span className="font-mono text-tinta">{demo.password}</span></p>
              <button type="button" className="mt-2 text-marca underline-offset-2 hover:underline" onClick={() => { setEmail(demo.email); setPass(demo.password) }}>Llenar por mí</button>
            </div>
          )}
          {modo === 'registro' && (
            <label className="block"><span className="etiqueta">Nombre completo</span>
              <span className="relative block"><User size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className="campo pl-10" required value={nombre} onChange={e => setNombre(e.target.value)} /></span></label>
          )}
          <label className="block"><span className="etiqueta">Usuario (correo)</span>
            <span className="relative block"><Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input className="campo pl-10" type="email" required autoComplete="username" placeholder="tu.nombre@empresa.mx" value={email} onChange={e => setEmail(e.target.value)} /></span></label>
          {modo !== 'recuperar' && (
            <label className="block"><span className="etiqueta">Contraseña</span>
              <span className="relative block"><Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input className="campo px-10" type={ver ? 'text' : 'password'} required minLength={8} autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
                  placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} />
                <button type="button" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-stone-400 hover:text-marca">{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </span></label>
          )}
          {msg && <Aviso tipo={msg.t}>{msg.m}</Aviso>}
          <button className="btn-primario w-full py-3" disabled={cargando}>
            {cargando ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : modo === 'registro' ? 'Crear cuenta' : 'Enviar enlace'}
          </button>
          <div className="flex justify-between text-sm">
            {modo !== 'entrar'
              ? <button type="button" className="text-stone-500 hover:text-marca" onClick={() => { setModo('entrar'); setMsg(null) }}>Ya tengo cuenta</button>
              : <button type="button" className="text-stone-500 hover:text-marca" onClick={() => { setModo('registro'); setMsg(null) }}>Crear cuenta</button>}
            {modo === 'entrar' && <button type="button" className="text-stone-500 hover:text-marca" onClick={() => { setModo('recuperar'); setMsg(null) }}>Olvidé mi contraseña</button>}
          </div>
        </form>
      </div>
    </div>
  )
}
