import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Rol } from './supabase'
import { aplicarApariencia, aplicarTema, temaGuardado, type Apariencia, type Tema } from './tema'

export type Perfil = {
  id: string
  nombre: string
  email: string | null
  rol: Rol
  activo: boolean
  todas_empresas: boolean
  usuario?: string | null
  foto_path?: string | null
  telefono?: string | null
  puesto?: string | null
  preferencias?: { tema?: Tema; accesos?: string[]; acento?: string | null; tablero?: unknown } | null
  es_super?: boolean
  empleado_id?: string | null
}

/** URL pública de la foto de perfil. */
export function fotoPerfil(p: { foto_path?: string | null } | null | undefined) {
  return p?.foto_path ? supabase.storage.from('perfiles').getPublicUrl(p.foto_path).data.publicUrl : null
}

type Ctx = {
  session: Session | null
  perfil: Perfil | null
  cargando: boolean
  puedeEditar: boolean
  puedeResguardar: boolean
  esAdmin: boolean
  esSuper: boolean
  apariencia: Apariencia
  setApariencia: (a: Apariencia) => void
  recargarPerfil: () => Promise<void>
  salir: () => Promise<void>
}

const AuthCtx = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [apariencia, setAp] = useState<Apariencia>({})
  const [acentoPersonal, setAcentoPersonal] = useState<string | null>(null)
  // el color que elige cada persona manda sobre el de la empresa
  const setApariencia = (a: Apariencia) => { setAp(a); aplicarApariencia({ ...a, acento: acentoPersonal ?? a.acento }) }

  async function cargarPerfil(uid: string | undefined) {
    if (!uid) { setPerfil(null); return }
    const { data } = await supabase.from('perfiles')
      .select('id,nombre,email,rol,activo,todas_empresas,usuario,foto_path,telefono,puesto,preferencias,es_super,empleado_id').eq('id', uid).maybeSingle()
    const p = (data as Perfil) ?? null
    setPerfil(p)
    // El tema elegido en el perfil sigue a la persona en cualquier equipo
    const t = p?.preferencias?.tema
    if (t && t !== temaGuardado()) aplicarTema(t)
    const ac = p?.preferencias?.acento ?? null
    setAcentoPersonal(ac)
    if (ac) aplicarApariencia({ ...apariencia, acento: ac })
    if (p?.activo) supabase.from('ajustes').select('valor').eq('clave', 'apariencia').maybeSingle()
      .then(({ data: a }) => { if (a) { const v = (a as { valor: Apariencia }).valor ?? {}; setAp(v); aplicarApariencia({ ...v, acento: ac ?? v.acento }) } })
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await cargarPerfil(data.session?.user.id)
      setCargando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // diferido para no bloquear el callback de auth
      setTimeout(() => { cargarPerfil(s?.user.id) }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const activo = !!perfil?.activo
  const value: Ctx = {
    session, perfil, cargando,
    puedeEditar: activo && (perfil!.rol === 'admin' || perfil!.rol === 'supervisor'),
    esAdmin: activo && perfil!.rol === 'admin',
    esSuper: activo && !!perfil!.es_super,
    apariencia, setApariencia,
    puedeResguardar: activo && perfil!.rol !== 'consulta',
    recargarPerfil: () => cargarPerfil(session?.user.id),
    salir: async () => { await supabase.auth.signOut(); setPerfil(null); navigator.serviceWorker?.controller?.postMessage('borrar-datos') },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const c = useContext(AuthCtx)
  if (!c) throw new Error('useAuth fuera de AuthProvider')
  return c
}
